use anyhow::{anyhow, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{fs, path::{PathBuf, Path}};
use uuid::Uuid;
use sha2::{Sha256, Digest};
use tokio::io::AsyncWriteExt;

use crate::api::ApiClient;

#[derive(Debug, Deserialize)]
pub struct FileMetadata {
    pub file_id: Uuid,
    pub current_version_id: Option<Uuid>,
    pub version_no: Option<i32>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub s3_version_id: Option<String>,
    pub size_bytes: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PresignDownloadResp { pub url: String }

#[derive(Debug, Deserialize)]
pub struct InitiateUploadResp {
    pub upload_type: String,
    pub object_key: String,
    pub url: String,
    pub headers: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct InitiateUploadReq {
    pub mime: Option<String>,
    pub size_bytes: i64,
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct CompleteUploadReq {
    pub object_key: String,
    pub size_bytes: i64,
    pub etag: Option<String>,
    pub sha256: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LockAcquireReq { pub file_id: Uuid, pub client_id: String }

#[derive(Debug, Deserialize)]
pub struct LockOut { pub id: Uuid, pub file_id: Uuid, pub locked_by: Uuid, pub expires_at: String, pub active: bool }

#[derive(Debug, Serialize)]
pub struct LockReleaseReq { pub lock_id: Uuid }

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Manifest {
    // key: "<file_id>/<version_id>" -> local path + last access
    pub entries: std::collections::HashMap<String, ManifestEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub local_path: String,
    pub size_bytes: i64,
    pub last_access_unix: i64,
}

fn proj_dirs() -> Result<ProjectDirs> {
    ProjectDirs::from("com", "workshop", "WorkshopDesktop").ok_or_else(|| anyhow!("No ProjectDirs"))
}

pub fn cache_root() -> Result<PathBuf> {
    let d = proj_dirs()?;
    let root = d.data_local_dir().join("cache").join("files");
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn manifest_path() -> Result<PathBuf> {
    Ok(proj_dirs()?.data_local_dir().join("cache").join("manifest.json"))
}

fn load_manifest() -> Result<Manifest> {
    let p = manifest_path()?;
    if !p.exists() { return Ok(Manifest::default()); }
    let data = fs::read_to_string(p)?;
    Ok(serde_json::from_str(&data)?)
}

fn save_manifest(m: &Manifest) -> Result<()> {
    let p = manifest_path()?;
    if let Some(parent) = p.parent() { fs::create_dir_all(parent)?; }
    fs::write(p, serde_json::to_string_pretty(m)?)?;
    Ok(())
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut f, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

pub async fn get_or_download(api: &ApiClient, file_id: Uuid) -> Result<PathBuf> {
    let meta: FileMetadata = api.get_json(&format!("/files/{}/metadata", file_id)).await?;
    let ver_id = meta.current_version_id.ok_or_else(|| anyhow!("File has no version yet"))?;

    let key = format!("{}/{}", file_id, ver_id);
    let mut man = load_manifest()?;

    if let Some(e) = man.entries.get_mut(&key) {
        let p = PathBuf::from(&e.local_path);
        if p.exists() {
            e.last_access_unix = now_unix();
            save_manifest(&man)?;
            return Ok(p);
        }
    }

    // Not cached => presign download
    let dl: PresignDownloadResp = api.post_json(&format!("/files/{}/presign-download", file_id), &serde_json::json!({})).await?;

    let root = cache_root()?;
    let dir = root.join(file_id.to_string()).join(ver_id.to_string());
    fs::create_dir_all(&dir)?;

    #[derive(Deserialize)]
    struct FileInfo { name: String }

    // Fetch real filename from API so we keep extension (.dxf/.skp/.pdf/...)
    let info: FileInfo = api.get_json(&format!("/files/{}", file_id)).await?;
    let filename = std::path::Path::new(&info.name)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("{}_{}", file_id, ver_id));

    let local_path = dir.join(filename);


    // Stream download
    let resp = reqwest::Client::new().get(&dl.url).send().await?;
    if !resp.status().is_success() { return Err(anyhow!("Download failed: {}", resp.status())); }
    let mut stream = resp.bytes_stream();

    let mut out = tokio::fs::File::create(&local_path).await?;
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        out.write_all(bytes.as_ref()).await?;
    }
    out.flush().await?;

    // Update manifest
    let size = tokio::fs::metadata(&local_path).await?.len() as i64;
    man.entries.insert(key, ManifestEntry {
        local_path: local_path.to_string_lossy().to_string(),
        size_bytes: size,
        last_access_unix: now_unix(),
    });
    save_manifest(&man)?;
    Ok(local_path)
}

pub async fn upload_local_as_new_version(api: &ApiClient, file_id: Uuid, local_path: &Path, mime: Option<String>) -> Result<()> {
    let size = std::fs::metadata(local_path)?.len() as i64;
    let filename = local_path.file_name().unwrap_or_default().to_string_lossy().to_string();

    let init: InitiateUploadResp = api.post_json(
        &format!("/files/{}/versions/initiate-upload", file_id),
        &InitiateUploadReq { mime: mime.clone(), size_bytes: size, filename }
    ).await?;

    // PUT to S3
    let mut req = reqwest::Client::new().put(&init.url);
    for (k, v) in init.headers.iter() {
        req = req.header(k, v);
    }
    let data = tokio::fs::read(local_path).await?;
    let res = req.body(data).send().await?;
    if !res.status().is_success() { return Err(anyhow!("Upload PUT failed: {}", res.status())); }
    let etag = res.headers().get("ETag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());

    let sha = sha256_file(local_path).ok(); // optional, can be heavy for 1GB; keep for integrity.
    let _meta: FileMetadata = api.post_json(
        &format!("/files/{}/versions/complete-upload", file_id),
        &CompleteUploadReq { object_key: init.object_key, size_bytes: size, etag, sha256: sha }
    ).await?;

    Ok(())
}

pub async fn acquire_lock(api: &ApiClient, file_id: Uuid, client_id: String) -> Result<LockOut> {
    let lock: LockOut = api.post_json("/locks/acquire", &LockAcquireReq { file_id, client_id }).await?;
    Ok(lock)
}

pub async fn release_lock(api: &ApiClient, lock_id: Uuid) -> Result<()> {
    let _r: serde_json::Value = api.post_json("/locks/release", &LockReleaseReq { lock_id }).await?;
    Ok(())
}
