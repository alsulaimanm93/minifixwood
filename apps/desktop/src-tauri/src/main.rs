mod api;
mod cache;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct OpenReq {
    api_base: String,
    token: String,
    file_id: String,
    client_id: String,
    open_with: Option<String>, // optional: path to an exe; otherwise OS default
}

#[derive(Debug, Serialize)]
struct OpenResp {
    local_path: String,
    lock_id: String,
}

#[command]
async fn cache_open(req: OpenReq) -> Result<OpenResp, String> {
    let file_id = Uuid::parse_str(&req.file_id).map_err(|e| e.to_string())?;
    let api = api::ApiClient::new(req.api_base, req.token);

    // Acquire lock first (exclusive edit). For read-only flows, call without lock later.
    let lock = cache::acquire_lock(&api, file_id, req.client_id).await.map_err(|e| e.to_string())?;

    let local = cache::get_or_download(&api, file_id).await.map_err(|e| e.to_string())?;

    // Open file
    if let Some(exe) = req.open_with {
        // Windows: run exe with file path
        std::process::Command::new(exe)
            .arg(&local)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        open::that(&local).map_err(|e| e.to_string())?;
    }

    Ok(OpenResp { local_path: local.to_string_lossy().to_string(), lock_id: lock.id.to_string() })
}

#[derive(Debug, Deserialize)]
struct UploadReq {
    api_base: String,
    token: String,
    file_id: String,
    local_path: String,
    mime: Option<String>,
}

#[command]
async fn cache_upload(req: UploadReq) -> Result<(), String> {
    let file_id = Uuid::parse_str(&req.file_id).map_err(|e| e.to_string())?;
    let api = api::ApiClient::new(req.api_base, req.token);
    let p = std::path::PathBuf::from(req.local_path);
    cache::upload_local_as_new_version(&api, file_id, &p, req.mime).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct ReleaseReq {
    api_base: String,
    token: String,
    lock_id: String,
}

#[command]
async fn cache_release(req: ReleaseReq) -> Result<(), String> {
    let lock_id = Uuid::parse_str(&req.lock_id).map_err(|e| e.to_string())?;
    let api = api::ApiClient::new(req.api_base, req.token);
    cache::release_lock(&api, lock_id).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![cache_open, cache_upload, cache_release])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
