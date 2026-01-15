"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Status =
  | "under_preparation"
  | "prepared_for_quotation"
  | "pending_confirmation"
  | "current"
  | "finished"
  | "rejected";

type Project = {
  id: string;
  project_no?: number | null;
  name: string;
  status: Status;
  priority: number;
  updated_at: string;
};

type FileRow = {
  id: string;
  project_id?: string | null;
  kind: string;
  name: string;
  mime?: string | null;
  size_bytes: number;
  current_version_id?: string | null;
  updated_at?: string | null;
};


type SectionKey = "overview" | "commercial" | "technical" | "images" | "cnc" | "materials";

const STATUS_ORDER: Status[] = [
  "under_preparation",
  "prepared_for_quotation",
  "pending_confirmation",
  "current",
  "finished",
  "rejected",
];

const STATUS_TITLES: Record<Status, string> = {
  under_preparation: "Under Preparation",
  prepared_for_quotation: "Prepared for Quotation",
  pending_confirmation: "Pending Confirmation",
  current: "Current",
  finished: "Finished",
  rejected: "Rejected",
};

const SECTION_ORDER: SectionKey[] = ["overview", "commercial", "technical", "images", "cnc", "materials"];

const SECTION_TITLES: Record<SectionKey, string> = {
  overview: "Overview",
  commercial: "Invoices & Contracts",
  technical: "Technical",
  images: "Images",
  cnc: "CNC",
  materials: "Materials",
};

function getAuthToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

function extOf(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

function previewKind(name: string) {
  const e = extOf(name);
  const isImg = ["jpg", "jpeg", "png", "webp", "gif"].includes(e);
  const isPdf = e === "pdf";
  const isCsv = e === "csv";
  const isXlsx = ["xls", "xlsx"].includes(e);
  const isDocx = ["doc", "docx"].includes(e);
  const isCnc = ["dxf", "nc", "tap", "gcode"].includes(e);
  return { e, isImg, isPdf, isCsv, isXlsx, isDocx, isCnc };
}

function fmtSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function classifySection(f: FileRow): Exclude<SectionKey, "overview"> {
  const n = (f.name || "").toLowerCase();
  const { isCnc, isXlsx, isDocx, isImg, isPdf, isCsv } = previewKind(f.name || "");

  if (isCnc || n.includes("nest") || n.includes("toolpath") || n.includes("grouped")) return "cnc";
  if (n.includes("bom") || n.includes("material") || n.includes("supplier") || n.includes("cutlist") || (isXlsx && n.includes("bom"))) return "materials";
  if (n.includes("invoice") || n.includes("contract") || n.includes("quote") || n.includes("quotation") || n.includes("receipt")) return "commercial";
  if (isDocx && (n.includes("contract") || n.includes("quote"))) return "commercial";
  if (n.includes("site") || n.includes("measure") || n.includes("dimension") || n.includes("as-built")) return "technical";
  if (isCsv && (n.includes("measure") || n.includes("dimension"))) return "technical";

  if (f.kind === "image" || isImg) return "images";
  if (isPdf) return "technical";

  return "technical";
}

function fmtUpdatedAt(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ProjectsWorkspace() {
  const [all, setAll] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [projQ, setProjQ] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("overview");

  const [files, setFiles] = useState<FileRow[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  async function loadAll() {
    setErr(null);
    try {
      // preferred
      const rows = await apiFetch<Project[]>("/projects/all");
      setAll(rows);
      if (!selectedProjectId && rows.length) {
        const cur = rows.find((p) => p.status === "current") || rows[0];
        setSelectedProjectId(cur.id);
      }
    } catch (e1: any) {
      // fallback if /projects/all doesn't exist yet
      try {
        const chunks = await Promise.all(
          STATUS_ORDER.map((st) => apiFetch<Project[]>(`/projects?status=${encodeURIComponent(st)}`))
        );
        const merged = chunks.flat();
        setAll(merged);
        if (!selectedProjectId && merged.length) {
          const cur = merged.find((p) => p.status === "current") || merged[0];
          setSelectedProjectId(cur.id);
        }
      } catch (e2: any) {
        setErr(e2?.message || e1?.message || String(e2 || e1));
      }
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFiles(projectId: string) {
    setFilesErr(null);
    setPreviewErr(null);
    setSelectedFileId(null);
    setPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const res = await apiFetch<FileRow[]>(`/files?project_id=${encodeURIComponent(projectId)}`, { method: "GET" });
      setFiles(res);
    } catch (e: any) {
      setFilesErr(e?.message || String(e));
      setFiles([]);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) {
      setFiles([]);
      return;
    }
    loadFiles(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const filtered = useMemo(() => {
    const needle = projQ.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((p) => (p.name || "").toLowerCase().includes(needle));
  }, [all, projQ]);

  const grouped = useMemo(() => {
    const g: Record<Status, Project[]> = {
      under_preparation: [],
      prepared_for_quotation: [],
      pending_confirmation: [],
      current: [],
      finished: [],
      rejected: [],
    };
    for (const p of filtered) g[p.status]?.push(p);
    for (const st of STATUS_ORDER) {
      g[st] = [...g[st]].sort((a, b) => {
        const pr = (b.priority ?? 0) - (a.priority ?? 0);
        if (pr !== 0) return pr;
        return String(b.updated_at).localeCompare(String(a.updated_at));
      });
    }
    return g;
  }, [filtered]);

  const selectedProject = useMemo(
    () => all.find((p) => p.id === selectedProjectId) || null,
    [all, selectedProjectId]
  );
async function openPreview(f: FileRow) {
  setPreviewErr(null);
  setPreviewObjectUrl((p) => {
    if (p) URL.revokeObjectURL(p);
    return null;
  });

  const { isImg, isPdf } = previewKind(f.name);
  if (!isImg && !isPdf) return;

  const token = getAuthToken();
  if (!token) {
    setPreviewErr("Not logged in");
    return;
  }

  setBusyFileId(f.id);
  try {
    const r = await fetch(`/api/files/${f.id}/download?inline=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Preview failed ${r.status}`);
    const blob = await r.blob();
    setPreviewObjectUrl(URL.createObjectURL(blob));
  } catch (e: any) {
    setPreviewErr(e?.message || String(e));
  } finally {
    setBusyFileId(null);
  }
}

  const visibleFiles = useMemo(() => {
    if (section === "overview") return [...files].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const want = section; // commercial / technical / images / cnc / materials
    return files
      .filter((f) => classifySection(f) === want)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [files, section]);

  const selectedFile = useMemo(() => {
    return visibleFiles.find((f) => f.id === selectedFileId) || null;
  }, [visibleFiles, selectedFileId]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "360px 260px 1fr",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* LEFT: project categories */}
      <div
        style={{
          position: "sticky",
          top: 12,
          alignSelf: "start",
          border: "1px solid #30363d",
          borderRadius: 16,
          background: "#0f1623",
          padding: 12,
          maxHeight: "calc(100vh - 24px)",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Projects</div>
          <button
            onClick={loadAll}
            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
          >
            Refresh
          </button>
        </div>

        <input
          value={projQ}
          onChange={(e) => setProjQ(e.target.value)}
          placeholder="Search projectsâ€¦"
          style={{
            width: "100%",
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #30363d",
            background: "#0b0f17",
            color: "#e6edf3",
            fontSize: 14,
          }}
        />

        {err && <div style={{ color: "#ff7b72", marginTop: 10 }}>{err}</div>}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {STATUS_ORDER.map((st) => {
            const items = grouped[st] || [];
            return (
              <details key={st} open style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17" }}>
                <summary style={{ cursor: "pointer", padding: "10px 10px", display: "flex", justifyContent: "space-between", userSelect: "none" }}>
                  <div style={{ fontWeight: 900 }}>{STATUS_TITLES[st]}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{items.length}</div>
                </summary>

                <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.length === 0 ? (
                    <div style={{ opacity: 0.6, fontSize: 12, padding: "2px 4px" }}>No projects</div>
                  ) : (
                    items.map((p) => {
                      const selected = p.id === selectedProjectId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setSection("overview");
                          }}
                          style={{
                            textAlign: "left",
                            width: "100%",
                            padding: "10px 10px",
                            borderRadius: 12,
                            border: "1px solid #30363d",
                            background: selected ? "#111827" : "#0f1623",
                            color: "#e6edf3",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, lineHeight: 1.2, fontSize: 14 }}>{p.name}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, opacity: 0.75, fontSize: 12 }}>
                            <div>P{p.priority}</div>
                            <div style={{ whiteSpace: "nowrap" }}>{fmtUpdatedAt(p.updated_at)}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* MIDDLE: sections inside project */}
      <div
        style={{
          position: "sticky",
          top: 12,
          alignSelf: "start",
          border: "1px solid #30363d",
          borderRadius: 16,
          background: "#0f1623",
          padding: 12,
          maxHeight: "calc(100vh - 24px)",
          overflow: "auto",
        }}
      >
        {!selectedProject ? (
          <div style={{ opacity: 0.75 }}>Select a project</div>
        ) : (
          <>
            <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.25 }}>{selectedProject.name}</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>{STATUS_TITLES[selectedProject.status] || selectedProject.status}</div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {SECTION_ORDER.map((k) => {
                const active = k === section;
                return (
                  <button
                    key={k}
                    onClick={() => setSection(k)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: "12px 12px",
                      borderRadius: 12,
                      border: "1px solid #30363d",
                      background: active ? "#111827" : "#0b0f17",
                      color: "#e6edf3",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{SECTION_TITLES[k]}</div>
                    <div style={{ opacity: 0.6, fontSize: 12 }}>â€º</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: work area */}
      <div style={{ border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14, minHeight: 560 }}>
        {!selectedProject ? (
          <div style={{ opacity: 0.75 }}>Pick a project from the left.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18 }}>Workspace</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>
                  {selectedProject.name} â€¢ {SECTION_TITLES[section]}
                </div>
              </div>

              <a
                href={`/project/${selectedProject.id}`}
                style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", textDecoration: "none", fontWeight: 900 }}
              >
                Open project
              </a>
            </div>

            {(filesErr || previewErr) && (
            <div style={{ color: "#ff7b72", marginTop: 12 }}>
                {filesErr || previewErr}
            </div>
            )}

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 14, alignItems: "start" }}>
            {/* Files list */}
            <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 520 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>Files â€¢ {SECTION_TITLES[section]}</div>
                <button
                    onClick={() => (selectedProjectId ? loadFiles(selectedProjectId) : null)}
                    style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                >
                    Refresh
                </button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {visibleFiles.length === 0 ? (
                    <div style={{ opacity: 0.75 }}>No files in this section.</div>
                ) : (
                    visibleFiles.map((f) => {
                    const active = f.id === selectedFileId;
                    return (
                        <button
                        key={f.id}
                        onClick={() => {
                            setSelectedFileId(f.id);
                            openPreview(f);
                        }}
                        style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #30363d",
                            background: active ? "#111827" : "#0f1623",
                            color: "#e6edf3",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "flex-start",
                        }}
                        >
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                            <div style={{ opacity: 0.75, fontSize: 12 }}>
                            {f.kind} â€¢ {fmtSize(f.size_bytes)}
                            </div>
                        </div>
                        <div style={{ opacity: 0.7, fontSize: 12, whiteSpace: "nowrap" }}>{busyFileId === f.id ? "â€¦" : ""}</div>
                        </button>
                    );
                    })
                )}
                </div>
            </div>

            {/* Preview */}
            <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 520 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>Preview</div>

                {!selectedFile ? (
                <div style={{ opacity: 0.75, marginTop: 10 }}>Select a file.</div>
                ) : (
                <>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 900, lineHeight: 1.25 }}>{selectedFile.name}</div>
                    <div style={{ opacity: 0.75, fontSize: 12, whiteSpace: "nowrap" }}>{fmtSize(selectedFile.size_bytes)}</div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                    {(() => {
                        const { isImg, isPdf, isDocx, isXlsx } = previewKind(selectedFile.name || "");

                        if (isImg && previewObjectUrl) {
                        return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                            src={previewObjectUrl}
                            alt={selectedFile.name}
                            style={{ width: "100%", maxHeight: 560, objectFit: "contain", borderRadius: 14, border: "1px solid #30363d", background: "#0f1623" }}
                            />
                        );
                        }

                        if (isPdf && previewObjectUrl) {
                        return (
                            <iframe
                            src={previewObjectUrl}
                            style={{ width: "100%", height: 560, borderRadius: 14, border: "1px solid #30363d", background: "#0f1623" }}
                            title="PDF Preview"
                            />
                        );
                        }

                        if (isDocx || isXlsx) {
                        return (
                            <div style={{ padding: 14, borderRadius: 14, border: "1px solid #30363d", background: "#0f1623" }}>
                            <div style={{ fontWeight: 900 }}>No inline preview</div>
                            <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>
                                Browser canâ€™t render {isXlsx ? "XLS/XLSX" : "DOC/DOCX"} directly. Use Open (main) or Download.
                            </div>
                            </div>
                        );
                        }

                        return (
                        <div style={{ padding: 14, borderRadius: 14, border: "1px solid #30363d", background: "#0f1623" }}>
                            <div style={{ fontWeight: 900 }}>Preview not available</div>
                            <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>Use Open.</div>
                        </div>
                        );
                    })()}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        onClick={async () => {
                          try {
                            const r = await apiFetch<{ url: string }>(`/files/${selectedFile.id}/presign-download`, { method: "POST" });
                            window.open(r.url, "_blank", "noopener,noreferrer");
                          } catch (e: any) {
                            setPreviewErr(e?.message || String(e));
                          }
                        }}

                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "white", fontWeight: 900 }}
                    >
                        Open
                    </button>
                    </div>
                </>
                )}
            </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}

