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

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
};

type RequirementRow = {
  id: string;
  project_id: string;
  item_id: string;
  qty_required: number;
  notes?: string | null;
  source: string;
  updated_at: string;
};

type AvailabilityRow = {
  item_id: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
  qty_required: number;
  qty_on_hand: number;
  qty_reserved_total: number;
  qty_available_net: number;
  qty_to_buy: number;
};

export default function ProjectPage() {
  const pathname = usePathname();
  const projectId = pathname.split("/").pop() || "";

  const [msg, setMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Inventory requirements (project-driven)
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<RequirementRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);

  const [itemQ, setItemQ] = useState("");
  const [itemHits, setItemHits] = useState<ItemRow[]>([]);
  const [picked, setPicked] = useState<ItemRow | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");
  const [reqBusy, setReqBusy] = useState<string | null>(null);

  async function loadRequirements() {
    setReqErr(null);
    try {
      const r = await apiFetch<RequirementRow[]>(
        `/inventory/projects/${projectId}/requirements`,
        { method: "GET" }
      );
      setRequirements(r || []);
      const a = await apiFetch<AvailabilityRow[]>(
        `/inventory/projects/${projectId}/availability`,
        { method: "GET" }
      );
      setAvailability(a || []);
    } catch (e: any) {
      setReqErr(e?.message || String(e));
    }
  }

  async function searchItems(term: string) {
    const t = (term || "").trim();
    setItemQ(term);
    setPicked(null);
    if (!t) {
      setItemHits([]);
      return;
    }
    try {
      const hits = await apiFetch<ItemRow[]>(
        `/inventory/items/search?q=${encodeURIComponent(t)}&limit=20`,
        { method: "GET" }
      );
      setItemHits(hits || []);
    } catch {
      setItemHits([]);
    }
  }

  async function addOrUpdateRequirement() {
    if (!picked) {
      setReqErr("Pick an item first.");
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q < 0) {
      setReqErr("Qty must be 0 or more.");
      return;
    }

    setReqErr(null);
    setReqBusy("save");
    try {
      await apiFetch<RequirementRow>(`/inventory/projects/${projectId}/requirements`, {
        method: "POST",
        body: JSON.stringify({
          item_id: picked.id,
          qty_required: q,
          notes: notes.trim() || null,
          source: "manual",
        }),
      });
      setPicked(null);
      setItemQ("");
      setItemHits([]);
      setQty(1);
      setNotes("");
      await loadRequirements();
    } catch (e: any) {
      setReqErr(e?.message || String(e));
    } finally {
      setReqBusy(null);
    }
  }

  async function deleteRequirement(itemId: string) {
    setReqErr(null);
    setReqBusy(`del:${itemId}`);
    try {
      await apiFetch(`/inventory/projects/${projectId}/requirements/${itemId}`, { method: "DELETE" });
      await loadRequirements();
    } catch (e: any) {
      setReqErr(e?.message || String(e));
    } finally {
      setReqBusy(null);
    }
  }

  async function loadFiles() {
    setMsg(null);
    try {
      const res = await apiFetch<FileRow[]>(
        `/files?project_id=${encodeURIComponent(projectId)}`,
        { method: "GET" }
      );
      setFiles(res);
      setSelected((prev) => {
        if (prev && res.some((x) => x.id === prev.id)) return prev;
        return res[0] ?? null;
      });
    } catch (e: any) {
      setMsg(e.message || String(e));
    }
  }

  useEffect(() => {
    loadFiles();
    loadRequirements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      setPreviewUrl(null);
      if (!selected) return;

      // Only preview images + pdf
      const mime = (selected.mime || "").toLowerCase();
      if (!(mime.startsWith("image/") || mime === "application/pdf")) return;

      try {
        const res = await apiFetch<{ url: string }>(`/files/${selected.id}/presign-download`, {
          method: "POST",
        });
        if (!cancelled) setPreviewUrl(res.url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    }
    loadPreview();
    return () => { cancelled = true; };
  }, [selected]);

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
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setMsg(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function openFile(f: FileRow) {
    setMsg(null);
    setBusyId(`open:${f.id}`);
    try {
      // 1) get presigned download URL (auth works via apiFetch)
      const res = await apiFetch<{ url: string }>(`/files/${f.id}/presign-download`, {
        method: "POST",
      });

      // 2) call local helper (runs on your PC) to cache+open the file
      const token =
        (typeof window !== "undefined" &&
          (localStorage.getItem("access_token") ||
            localStorage.getItem("token") ||
            localStorage.getItem("auth_token"))) ||
        null;

      const r = await fetch("http://127.0.0.1:17832/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          file_id: f.id,
          filename: f.name,
          mime: f.mime || null,
          download_url: res.url,
          token,
        }),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Local helper error (${r.status}): ${t}`);
      }

      setMsg("Opened ✅ (local cache)");
    } catch (e: any) {
      // This is the common case until helper is running:
      // "Failed to fetch" => helper not running
      setMsg(
        (e?.message || String(e)) +
          " | If you see 'Failed to fetch', start the local helper first."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Project</h1>
      <p style={{ opacity: 0.8 }}>ID: {projectId}</p>
      {/* Requirements / BOM (project-driven) */}
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
          <div>
            <div style={{ fontWeight: 900 }}>Requirements (BOM)</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              Add required items here. “Need to buy” is calculated automatically.
            </div>
          </div>
          <button
            onClick={loadRequirements}
            disabled={reqBusy != null}
            style={{
              border: "1px solid #30363d",
              borderRadius: 12,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.04)",
              color: "inherit",
              cursor: reqBusy ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            Refresh
          </button>
        </div>

        {reqErr && <div style={{ marginTop: 10, color: "#ffb4b4" }}>{reqErr}</div>}

        {/* Add requirement */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
          <div>
            <input
              value={itemQ}
              onChange={(e) => searchItems(e.target.value)}
              placeholder="Search item by SKU / name…"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "transparent",
                color: "inherit",
                outline: "none",
              }}
            />

            {itemHits.length > 0 && !picked && (
              <div style={{ marginTop: 8, border: "1px solid #30363d", borderRadius: 12, overflow: "hidden" }}>
                {itemHits.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setPicked(it);
                      setItemHits([]);
                      setItemQ(`${it.sku} — ${it.name}`);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderBottom: "1px solid #30363d",
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.12)",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{it.sku}</div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>
                      {it.name} • {it.type} • {it.uom}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "transparent",
                color: "inherit",
                outline: "none",
              }}
            />
          </div>

          <div>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "transparent",
                color: "inherit",
                outline: "none",
              }}
            />
            <button
              onClick={addOrUpdateRequirement}
              disabled={reqBusy != null}
              style={{
                marginTop: 8,
                width: "100%",
                border: "1px solid #30363d",
                borderRadius: 12,
                padding: "10px 12px",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                cursor: reqBusy ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Availability / Need to buy */}
        <div style={{ marginTop: 14, borderTop: "1px solid #30363d", paddingTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Availability / Need to buy</div>

          {availability.length === 0 ? (
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              No requirements yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {availability.map((r) => (
                <div
                  key={r.item_id}
                  style={{
                    border: "1px solid #30363d",
                    borderRadius: 14,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {r.sku} — {r.name}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>
                      {r.type} • required {r.qty_required} {r.uom} • on-hand {r.qty_on_hand} • reserved {r.qty_reserved_total}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>
                      Need to buy: {r.qty_to_buy} {r.uom}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      Net available: {r.qty_available_net}
                    </div>

                    <button
                      onClick={() => deleteRequirement(r.item_id)}
                      disabled={reqBusy === `del:${r.item_id}`}
                      style={{
                        marginTop: 6,
                        border: "1px solid #30363d",
                        borderRadius: 10,
                        padding: "6px 8px",
                        background: "rgba(255,0,0,0.08)",
                        color: "inherit",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 12,
            alignItems: "start",
          }}
        >
          {/* List */}
          <div style={{ display: "grid", gap: 8 }}>
            {files.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No files yet.</div>
            ) : (
              files.map((f) => {
                const isSel = selected?.id === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelected(f)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      padding: 10,
                      borderRadius: 12,
                      border: isSel ? "1px solid #1f6feb" : "1px solid #30363d",
                      background: isSel ? "#0b1b33" : "#0b1220",
                      cursor: "pointer",
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
                        onClick={(e) => { e.stopPropagation(); openFile(f); }}
                        disabled={busyId === `open:${f.id}`}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          border: "1px solid #30363d",
                          background: "#2ea043",
                          color: "white",
                          fontWeight: 900,
                        }}
                      >
                        {busyId === `open:${f.id}` ? "..." : "Open"}
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); downloadFile(f.id); }}
                        disabled={busyId === f.id}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          border: "1px solid #30363d",
                          background: "#111827",
                          color: "#e6edf3",
                          fontWeight: 800,
                        }}
                      >
                        {busyId === f.id ? "..." : "Download"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Preview */}
          <div
            style={{
              border: "1px solid #30363d",
              borderRadius: 12,
              background: "#0b1220",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 10, borderBottom: "1px solid #30363d", fontWeight: 800 }}>
              Preview
              <div style={{ fontWeight: 400, opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                {selected ? selected.name : "Select a file"}
              </div>
            </div>

            <div style={{ padding: 10 }}>
              {!selected ? (
                <div style={{ opacity: 0.8 }}>Select a file from the list.</div>
              ) : selected.mime?.toLowerCase().startsWith("image/") ? (
                previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={selected.name}
                    style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
                  />
                ) : (
                  <div style={{ opacity: 0.8 }}>Loading preview…</div>
                )
              ) : selected.mime?.toLowerCase() === "application/pdf" ? (
                previewUrl ? (
                  <iframe src={`/api/files/${selected.id}/pdf`} style={{ width: "100%", height: 520, border: 0, borderRadius: 10 }} />

                ) : (
                  <div style={{ opacity: 0.8 }}>Loading preview…</div>
                )
              ) : (
                <div style={{ opacity: 0.85 }}>
                  Preview not available for this file type. Use <b>Download</b>.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
