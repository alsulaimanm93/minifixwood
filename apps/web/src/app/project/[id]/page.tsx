"use client";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

type FileRow = {
  id: string;
  project_id?: string | null;
  kind: string;
  name: string;
  mime?: string | null;
  size_bytes: number;
  current_version_id?: string | null;
};


export default function ProjectPage() {
  const pathname = usePathname();
  const projectId = pathname.split("/").pop() || "";

  const [msg, setMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadFiles() {
    setMsg(null);
    try {
      const res = await apiFetch<FileRow[]>(
        `/files?project_id=${encodeURIComponent(projectId)}`,
        { method: "GET" }
      );
      setFiles(res);
    } catch (e: any) {
      setMsg(e.message || String(e));
    }
  }

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFile(file: File) {
    setMsg(null);
    setBusyId("upload");
    try {
      // 1) create logical file row
      const f = await apiFetch<{ id: string }>(`/files`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          kind: file.type.startsWith("image/") ? "image" : "other",
          name: file.name,
          mime: file.type,
          size_bytes: file.size,
        }),
      });

      // 2) initiate upload (presigned PUT)
      const init = await apiFetch<{
        url: string;
        headers: Record<string, string>;
        object_key: string;
      }>(`/files/${f.id}/versions/initiate-upload`, {
        method: "POST",
        body: JSON.stringify({
          mime: file.type,
          size_bytes: file.size,
          filename: file.name,
        }),
      });

      // 3) upload to S3/MinIO
      const putRes = await fetch(init.url, {
        method: "PUT",
        headers: init.headers,
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      const etag = putRes.headers.get("ETag") || putRes.headers.get("etag") || undefined;

      // 4) complete upload (create version)
      await apiFetch(`/files/${f.id}/versions/complete-upload`, {
        method: "POST",
        body: JSON.stringify({
          object_key: init.object_key,
          size_bytes: file.size,
          etag,
        }),
      });

      setMsg("Uploaded and versioned ✅");
      await loadFiles();
    } catch (err: any) {
      setMsg(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function downloadFile(fileId: string) {
    setMsg(null);
    setBusyId(fileId);
    try {
      const res = await apiFetch<{ url: string }>(`/files/${fileId}/presign-download`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setMsg(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Project</h1>
      <p style={{ opacity: 0.8 }}>ID: {projectId}</p>

      <div
        style={{
          marginTop: 16,
          border: "1px solid #30363d",
          borderRadius: 16,
          padding: 12,
          background: "#0f1623",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Upload photo / file</div>
        <input
          type="file"
          disabled={busyId === "upload"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {msg && (
        <div style={{ marginTop: 12, color: msg.includes("✅") ? "#7ee787" : "#ff7b72" }}>
          {msg}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          border: "1px solid #30363d",
          borderRadius: 16,
          padding: 12,
          background: "#0f1623",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>Files</div>
          <button
            onClick={loadFiles}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #30363d",
              background: "#111827",
              color: "#e6edf3",
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {files.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No files yet.</div>
          ) : (
            files.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0b1220",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{f.name}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {f.kind} • {(f.size_bytes / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => downloadFile(f.id)}
                    disabled={busyId === f.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #30363d",
                      background: "#1f6feb",
                      color: "white",
                      fontWeight: 800,
                    }}
                  >
                    {busyId === f.id ? "..." : "Download"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
