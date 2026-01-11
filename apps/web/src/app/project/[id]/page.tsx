"use client";
import React, { useEffect, useState } from "react";
import { apiFetch, API_BASE } from "@/lib/api";

export default function ProjectPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [fileId, setFileId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Minimal: upload a photo/file for the project into S3 via presigned URL.
  async function uploadFile(file: File) {
    setMsg(null);
    // 1) create logical file
    const f = await apiFetch<{ id: string }>(`/files`, {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        kind: file.type.startsWith("image/") ? "image" : "other",
        name: file.name,
        mime: file.type,
        size_bytes: file.size
      })
    });
    setFileId(f.id);

    // 2) initiate upload (presign PUT)
    const init = await apiFetch<{ url: string; headers: Record<string,string>; object_key: string }>(
      `/files/${f.id}/versions/initiate-upload`,
      { method: "POST", body: JSON.stringify({ mime: file.type, size_bytes: file.size, filename: file.name }) }
    );

    // 3) upload to S3
    const putRes = await fetch(init.url, { method: "PUT", headers: init.headers, body: file });
    if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
    const etag = putRes.headers.get("ETag") || putRes.headers.get("etag") || undefined;

    // 4) complete upload (create version)
    await apiFetch(`/files/${f.id}/versions/complete-upload`, {
      method: "POST",
      body: JSON.stringify({ object_key: init.object_key, size_bytes: file.size, etag })
    });

    setMsg("Uploaded and versioned ✅");
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Project</h1>
      <p style={{ opacity: 0.8 }}>ID: {projectId}</p>

      <div style={{ marginTop: 16, border: "1px solid #30363d", borderRadius: 16, padding: 12, background: "#0f1623" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Upload photo / file</div>
        <input type="file" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file).catch(err => setMsg(err.message || String(err)));
        }} />
        {msg && <div style={{ marginTop: 10, color: msg.includes("✅") ? "#7ee787" : "#ff7b72" }}>{msg}</div>}
        {fileId && <div style={{ marginTop: 10, opacity: 0.8 }}>Last uploaded file_id: {fileId}</div>}
      </div>
    </div>
  );
}
