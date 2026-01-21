"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

  thumbnail_file_id?: string | null;

  // Payments / delivery
  eta_date?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  payment_date?: string | null;
  max_days_to_finish?: number | null;

  // Inventory (lightweight now)
  inventory_state?: Record<string, any> | null;
  missing_items?: string | null;
  inventory_notes?: string | null;
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

type FileVersionRow = {
  id: string;
  version_no: number;
  size_bytes?: number | null;
  created_at?: string | null;
  created_by?: string | null;
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

function extFromMime(mime?: string | null) {
  const m = String(mime || "").toLowerCase().trim();
  if (!m) return "";
  const parts = m.split("/");
  if (parts.length !== 2) return "";
  let e = parts[1] || "";
  if (e.includes("+")) e = e.split("+")[0];
  if (e === "jpeg") e = "jpg";
  return e;
}

// Keep extension visible: "very-long-name...stuff.jpg" -> "very-long...stuff.jpg"
function midEllipsisKeepExt(name: string, maxChars: number) {
  const n = name || "";
  if (n.length <= maxChars) return n;

  const dot = n.lastIndexOf(".");
  const hasExt = dot > 0 && dot < n.length - 1;

  const ext = hasExt ? n.slice(dot) : ""; // includes "."
  const base = hasExt ? n.slice(0, dot) : n;

  // ensure we never drop the extension
  const keepExtLen = ext.length;
  const available = Math.max(6, maxChars - keepExtLen - 1); // 1 for "…"
  const head = Math.max(4, Math.floor(available * 0.6));
  const tail = Math.max(2, available - head);

  const out = `${base.slice(0, head)}…${base.slice(-tail)}${ext}`;
  return out.length > maxChars ? out.slice(0, maxChars - keepExtLen - 1) + "…" + ext : out;
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
  const k = (f.kind || "").toLowerCase();
  if (k === "commercial" || k === "technical" || k === "images" || k === "cnc" || k === "materials") return k as any;

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

function fmtMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

function calcBalance(total: number | null | undefined, paid: number | null | undefined) {
  const t = total == null ? 0 : Number(total);
  const p = paid == null ? 0 : Number(paid);
  const b = t - p;
  return Number.isFinite(b) ? b : 0;
}

export default function ProjectsWorkspace() {
  const router = useRouter();
  const [all, setAll] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [projQ, setProjQ] = useState("");

  // Mobile navigation (OneDrive-like): Projects -> Sections -> Files
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"projects" | "sections" | "files">("projects");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(!!mq.matches);

    apply();
    // modern browsers
    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      // safari fallback
      // @ts-ignore
      mq.addListener(apply);
      // @ts-ignore
      return () => mq.removeListener(apply);
    }
  }, []);

  // Project card size (Large/Medium/Small). Small uses grid.
  const [projCardSize, setProjCardSize] = useState<"large" | "medium" | "small">("large");
  const projectCardHeight = projCardSize === "small" ? 120 : projCardSize === "medium" ? 150 : 170;

  function decProjCardSize() {
    setProjCardSize((s) => (s === "large" ? "medium" : s === "medium" ? "small" : "small"));
  }
  function incProjCardSize() {
    setProjCardSize((s) => (s === "small" ? "medium" : s === "medium" ? "large" : "large"));
  }
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("overview");

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newErr, setNewErr] = useState<string | null>(null);
  const [newBusy, setNewBusy] = useState(false);

  // Project rename/delete modals (UI-matching)
  const [projRenameOpen, setProjRenameOpen] = useState(false);
  const [projRenameDraft, setProjRenameDraft] = useState("");
  const [projRenameErr, setProjRenameErr] = useState<string | null>(null);
  const [projRenameBusy, setProjRenameBusy] = useState(false);

  const [projDeleteOpen, setProjDeleteOpen] = useState(false);
  const [projDeleteBusy, setProjDeleteBusy] = useState(false);

  async function createNewProject() {
    const name = (newName || "").trim();
    if (!name) {
      setNewErr("Project name is required.");
      return;
    }

    setNewErr(null);
    setNewBusy(true);
    try {
      const created = await apiFetch<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          status: "under_preparation", // server enforces too
          priority: 0,
          project_no: null,
          seed_templates: true,
        }),
      });

      setNewOpen(false);
      setNewName("");
      await loadAll();
      setSelectedProjectId(String(created.id));
      setSection("overview");
    } catch (e: any) {
      setNewErr(e?.message || String(e));
    } finally {
      setNewBusy(false);
    }
  }

  function renameSelectedProject() {
    if (!selectedProjectId) return;
    const p = all.find((x) => x.id === selectedProjectId);
    if (!p) return;

    setProjRenameDraft(p.name || "");
    setProjRenameErr(null);
    setProjRenameOpen(true);
  }

  async function commitProjectRename() {
    if (!selectedProjectId) return;
    const p = all.find((x) => x.id === selectedProjectId);
    if (!p) return;

    const name = (projRenameDraft || "").trim();
    if (!name) {
      setProjRenameErr("Project name is required.");
      return;
    }
    if (name === (p.name || "")) {
      setProjRenameOpen(false);
      setProjRenameErr(null);
      return;
    }

    setProjRenameBusy(true);
    setProjRenameErr(null);
    try {
      await apiFetch<Project>(`/projects/${selectedProjectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setProjRenameOpen(false);
      await loadAll();
    } catch (e: any) {
      setProjRenameErr(e?.message || String(e));
    } finally {
      setProjRenameBusy(false);
    }
  }

  function deleteSelectedProject() {
    if (!selectedProjectId) return;
    setProjDeleteOpen(true);
  }

  async function confirmDeleteSelectedProject() {
    if (!selectedProjectId) return;

    setProjDeleteBusy(true);
    setErr(null);
    try {
      await apiFetch<{ ok: boolean }>(`/projects/${selectedProjectId}`, { method: "DELETE" });
      setProjDeleteOpen(false);
      setSelectedProjectId(null);
      setSection("overview");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setProjDeleteBusy(false);
    }
  }

  async function moveProjectTo(projectId: string, nextStatus: Status) {
    const p = all.find((x) => x.id === projectId);
    if (!p) return;
    if (p.status === nextStatus) return;

    try {
      await apiFetch<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: p.name,
          status: nextStatus,
          priority: p.priority ?? 0,
          project_no: p.project_no ?? null,
          seed_templates: false,
        }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // Desktop-safe pointer drag + modern confirm modal (no HTML5 drag/drop)
  const [dragging, setDragging] = useState<null | {
    projectId: string;
    from: Status;
    name: string;
    x: number;
    y: number;
  }>(null);

  const [hoverStatus, setHoverStatus] = useState<Status | null>(null);

  const [confirmMove, setConfirmMove] = useState<null | {
    projectId: string;
    name: string;
    from: Status;
    to: Status;
  }>(null);

  const [movePicker, setMovePicker] = useState<null | {
    projectId: string;
    name: string;
    from: Status;
  }>(null);

  const dragRef = React.useRef<{
    pid: string;
    from: Status;
    name: string;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
  } | null>(null);

  const suppressClickRef = React.useRef(false);

  function findDropStatusFromPoint(clientX: number, clientY: number): Status | null {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    let cur: HTMLElement | null = el;
    while (cur) {
      const v = cur.getAttribute?.("data-drop-status");
      if (v) return v as Status;
      cur = cur.parentElement;
    }
    return null;
  }

  function startPointerDrag(e: React.PointerEvent, p: Project) {
    if ((e as any).button != null && (e as any).button !== 0) return;

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    dragRef.current = {
      pid: p.id,
      from: p.status,
      name: p.name,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
  }

  function movePointerDrag(e: React.PointerEvent) {
    if (!dragRef.current) return;

    const dx = Math.abs(e.clientX - dragRef.current.startX);
    const dy = Math.abs(e.clientY - dragRef.current.startY);

    if (!dragRef.current.active) {
      if (dx < 6 && dy < 6) return;
      dragRef.current.active = true;
      setDragging({
        projectId: dragRef.current.pid,
        from: dragRef.current.from,
        name: dragRef.current.name,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      setDragging((prev) =>
        prev
          ? { ...prev, x: e.clientX, y: e.clientY }
          : {
              projectId: dragRef.current!.pid,
              from: dragRef.current!.from,
              name: dragRef.current!.name,
              x: e.clientX,
              y: e.clientY,
            }
      );
    }

    const st = findDropStatusFromPoint(e.clientX, e.clientY);
    setHoverStatus(st);
  }

  function endPointerDrag(e: React.PointerEvent) {
    if (!dragRef.current) return;

    const wasActive = dragRef.current.active;
    const pid = dragRef.current.pid;
    const from = dragRef.current.from;
    const name = dragRef.current.name;

    dragRef.current = null;
    setDragging(null);

    if (!wasActive) return;

    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const to = findDropStatusFromPoint(e.clientX, e.clientY);
    setHoverStatus(null);

    if (!to) return;
    if (to === from) return;

    setConfirmMove({ projectId: pid, name, from, to });
  }

  async function confirmMoveYes() {
    if (!confirmMove) return;
    const { projectId, to } = confirmMove;
    setConfirmMove(null);
    await moveProjectTo(projectId, to);
  }

  const [files, setFiles] = useState<FileRow[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [versions, setVersions] = useState<FileVersionRow[]>([]);
  const [versionsErr, setVersionsErr] = useState<string | null>(null);
  const [busyVer, setBusyVer] = useState<string | null>(null);
  const [viewVersionId, setViewVersionId] = useState<string | null>(null);
  const [viewVersionNo, setViewVersionNo] = useState<number | null>(null);

  const [fileOpBusy, setFileOpBusy] = useState<"rename" | "delete" | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameExt, setRenameExt] = useState("");
  const [renameUiErr, setRenameUiErr] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // fileId -> preview URL (kept as mapping to avoid re-computing)
  const [thumbObjUrls, setThumbObjUrls] = useState<Record<string, string>>({});

  // Thumbnail picker modal (choose from existing project images)
  const [thumbPickProjectId, setThumbPickProjectId] = useState<string | null>(null);
  const [thumbPickOpen, setThumbPickOpen] = useState(false);
  const [thumbPickBusy, setThumbPickBusy] = useState(false);
  const [thumbPickErr, setThumbPickErr] = useState<string | null>(null);
  const [thumbPickFiles, setThumbPickFiles] = useState<FileRow[]>([]);
  const [thumbSavingProjectId, setThumbSavingProjectId] = useState<string | null>(null);


  // (thumbnails are stored server-side now via projects.thumbnail_file_id)

  async function ensureThumbObjUrl(fileId: string) {
    if (!fileId) return;
    if (thumbObjUrls[fileId]) return;
    const url = `/api/files/${fileId}/preview`;
    setThumbObjUrls((prev) => ({ ...(prev || {}), [fileId]: url }));
  }
  // When thumbs change, load missing object URLs
  useEffect(() => {
    const ids = (all || [])
      .map((p: any) => p?.thumbnail_file_id)
      .filter(Boolean) as string[];
    ids.forEach((id) => {
      if (!thumbObjUrls[id]) void ensureThumbObjUrl(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);
  async function openThumbPicker(projectId: string) {
    if (!projectId) return;
    if (thumbSavingProjectId) return;

    setThumbPickProjectId(projectId);
    setThumbPickOpen(true);
    setThumbPickBusy(true);
    setThumbPickErr(null);
    setThumbPickFiles([]);

    try {
      const res = await apiFetch<FileRow[]>(`/files?project_id=${encodeURIComponent(projectId)}`, { method: "GET" });
      const imgs = (res || []).filter((f) => {
        const n = (f.name || "").toLowerCase();
        const m = (f.mime || "").toLowerCase();
        return (
          m.startsWith("image/") ||
          n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp") || n.endsWith(".gif")
        );
      });

      setThumbPickFiles(imgs);

      // pre-warm preview URLs
      imgs.slice(0, 24).forEach((f) => {
        if (f?.id) void ensureThumbObjUrl(String(f.id));
      });
    } catch (e: any) {
      setThumbPickErr(e?.message || String(e));
    } finally {
      setThumbPickBusy(false);
    }
  }

  async function setThumbnail(projectId: string, fileId: string) {
    if (!projectId || !fileId) return;
    setThumbSavingProjectId(projectId);
    setThumbPickErr(null);

    try {
      await apiFetch(`/projects/${projectId}/thumbnail`, {
        method: "PATCH",
        body: JSON.stringify({ file_id: fileId }),
      });

      await loadAll(); // refresh thumbnails in the board
      setThumbPickOpen(false);
      setThumbPickProjectId(null);
      setThumbPickFiles([]);
    } catch (e: any) {
      setThumbPickErr(e?.message || String(e));
    } finally {
      setThumbSavingProjectId(null);
    }
  }

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

  useEffect(() => {
    let cancelled = false;

    // switching files always goes back to latest preview
    setViewVersionId(null);
    setViewVersionNo(null);

    async function loadVersions() {
      setVersionsErr(null);
      setVersions([]);
      if (!selectedFileId) return;

      try {
        const v = await apiFetch<FileVersionRow[]>(
          `/files/${selectedFileId}/versions`,
          { method: "GET" }
        );
        if (!cancelled) setVersions(v);
      } catch (e: any) {
        if (!cancelled) setVersionsErr(e?.message || String(e));
      }
    }

    loadVersions();
    return () => {
      cancelled = true;
    };
  }, [selectedFileId]);

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

  async function uploadToSelectedProject(file: File) {
    if (!selectedProjectId) return;
    console.log("uploadToSelectedProject", { selectedProjectId, name: file.name, size: file.size, type: file.type });
    setUploadErr(null);
    setUploading(true);
    setUploadErr(`Uploading: ${file.name}`);

    try {
      const inferredKind = classifySection({
        id: "tmp",
        project_id: selectedProjectId,
        kind: "file",
        name: file.name,
        size_bytes: file.size,
      } as any);

      const uploadKind = (section === "overview" ? inferredKind : (section as any));

      // 1) create DB file row
      const created = await apiFetch<FileRow>("/files", {
        method: "POST",
        body: JSON.stringify({
          project_id: selectedProjectId,
          kind: uploadKind,
          name: file.name,
          mime: file.type || null,
          size_bytes: file.size,
        }),
      });

      // 2) presign PUT
      const init = await apiFetch<{ object_key: string; url: string; headers: Record<string, string> }>(
        `/files/${created.id}/versions/initiate-upload`,
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size_bytes: file.size,
          }),
        }
      );

      // 3) upload bytes to MinIO/S3
      const putResp = await fetch(init.url, {
        method: "PUT",
        headers: init.headers || {},
        body: file,
      });

      if (!putResp.ok) {
        const t = await putResp.text().catch(() => "");
        throw new Error(`Upload failed: ${putResp.status} ${putResp.statusText}${t ? ` - ${t.slice(0, 200)}` : ""}`);
      }

      const etag = putResp.headers.get("etag") || putResp.headers.get("ETag") || null;

      // 4) complete upload => creates file_version + sets current
      await apiFetch(`/files/${created.id}/versions/complete-upload`, {
        method: "POST",
        body: JSON.stringify({
          object_key: init.object_key,
          etag,
          sha256: null,
          size_bytes: file.size,
        }),
      });

      setSection(uploadKind as any);
      await loadFiles(selectedProjectId);
      await loadAll(); // in case the first uploaded image became the project thumbnail
      setUploadErr(null);

    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    } finally {
      setUploading(false);
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

  const [setupTotal, setSetupTotal] = useState<string>("");
  const [setupPaid, setSetupPaid] = useState<string>("");
  const [setupPaymentDate, setSetupPaymentDate] = useState<string>("");
  const [setupMaxDays, setSetupMaxDays] = useState<string>("");
  const [setupInv, setSetupInv] = useState<Record<string, any>>({});
  const [setupMissing, setSetupMissing] = useState<string>("");
  const [setupNotes, setSetupNotes] = useState<string>("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) return;

    setSetupTotal(selectedProject.total_amount != null ? String(selectedProject.total_amount) : "");
    setSetupPaid(selectedProject.paid_amount != null ? String(selectedProject.paid_amount) : "");
    setSetupPaymentDate(selectedProject.payment_date ? String(selectedProject.payment_date).slice(0, 10) : "");
    setSetupMaxDays(selectedProject.max_days_to_finish != null ? String(selectedProject.max_days_to_finish) : "");
    setSetupInv((selectedProject.inventory_state as any) || {});
    setSetupMissing(selectedProject.missing_items || "");
    setSetupNotes(selectedProject.inventory_notes || "");
    setSetupMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  async function saveProjectSetup() {
    if (!selectedProjectId) return;

    setSetupBusy(true);
    setSetupMsg(null);

    const total = setupTotal.trim() === "" ? null : Number(setupTotal);
    const paid = setupPaid.trim() === "" ? null : Number(setupPaid);
    const maxDays = setupMaxDays.trim() === "" ? null : Number(setupMaxDays);

    if (total != null && !Number.isFinite(total)) {
      setSetupBusy(false);
      setSetupMsg("Total amount is not a valid number.");
      return;
    }
    if (paid != null && !Number.isFinite(paid)) {
      setSetupBusy(false);
      setSetupMsg("Paid amount is not a valid number.");
      return;
    }
    if (maxDays != null && (!Number.isFinite(maxDays) || maxDays < 0)) {
      setSetupBusy(false);
      setSetupMsg("Max days must be a positive number.");
      return;
    }

    try {
      await apiFetch<Project>(`/projects/${selectedProjectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          total_amount: total,
          paid_amount: paid,
          payment_date: setupPaymentDate ? setupPaymentDate : null,
          max_days_to_finish: maxDays,
          inventory_state: setupInv || {},
          missing_items: setupMissing || null,
          inventory_notes: setupNotes || null,
        }),
      });

      await loadAll();
      setSetupMsg("Saved.");
    } catch (e: any) {
      setSetupMsg(e?.message || String(e));
    } finally {
      setSetupBusy(false);
    }
  }

async function openVersion(versionId: string) {
  if (!selectedFile) return;
  setBusyVer(versionId);
  setVersionsErr(null);

  try {
    const r = await apiFetch<{ url: string }>(
      `/files/${selectedFile.id}/versions/${versionId}/presign-download`,
      { method: "POST" }
    );

    const token =
      (typeof window !== "undefined" &&
        (localStorage.getItem("access_token") ||
          localStorage.getItem("token") ||
          localStorage.getItem("auth_token"))) ||
      null;

    const resp = await fetch("http://127.0.0.1:17832/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_base: "http://api:8000",
        token,
        file_id: selectedFile.id,
        filename: selectedFile.name,
        mime: selectedFile.mime || null,
        download_url: r.url,
        watch: false, // opening old versions shouldn’t auto-upload unless you want it
      }),
    });

    if (!resp.ok) throw new Error(await resp.text());
  } catch (e: any) {
    setVersionsErr(e?.message || String(e));
  } finally {
    setBusyVer(null);
  }
}

async function openPreview(f: FileRow, versionId?: string | null) {
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
    const url = versionId
      ? `/api/files/${f.id}/versions/${versionId}/download?inline=1`
      : `/api/files/${f.id}/download?inline=1`;

    const r = await fetch(url, {
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

async function viewVersion(v: FileVersionRow) {
  if (!selectedFile) return;
  setViewVersionId(v.id);
  setViewVersionNo(v.version_no);
  await openPreview(selectedFile, v.id);
}

async function viewLatest() {
  if (!selectedFile) return;
  setViewVersionId(null);
  setViewVersionNo(null);
  await openPreview(selectedFile);
}

function openRenameModal() {
  if (!selectedFile) return;

  const nm = selectedFile.name || "";
  const dot = nm.lastIndexOf(".");
  const base = dot > 0 ? nm.slice(0, dot) : nm;
  const ext = dot > 0 ? nm.slice(dot) : ""; // includes "."

  setRenameDraft(base);
  setRenameExt(ext);
  setRenameUiErr(null);
  setRenameOpen(true);
}

async function commitRename() {
  if (!selectedFile) return;

  const current = selectedFile.name || "";
  let base = (renameDraft || "").trim();

  if (!base) {
    setRenameUiErr("Name can’t be empty.");
    return;
  }

  const ext = renameExt || "";
  const extNoDot = ext.startsWith(".") ? ext.slice(1).toLowerCase() : "";
  const commonExts = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "gif", "webp", "dxf", "nc", "tap", "gcode", "txt", "zip", "rar", "7z"];

  // If user typed a full name with extension, strip it only when it actually looks like an extension.
  if (extNoDot) {
    const m = base.match(/^(.*)\.([A-Za-z0-9]{1,8})$/);
    if (m) {
      const typedExt = (m[2] || "").toLowerCase();
      if (typedExt === extNoDot || commonExts.includes(typedExt)) {
        base = m[1];
      }
    }

    base = base.replace(/[.\s]+$/g, "").trim();
    if (!base) {
      setRenameUiErr("Name can’t be empty.");
      return;
    }
  }

  const next = ext ? `${base}${ext}` : base;
  if (!next || next === current) {
    setRenameOpen(false);
    return;
  }

  setPreviewErr(null);
  setRenameUiErr(null);
  setFileOpBusy("rename");
  try {
    const updated = await apiFetch<FileRow>(`/files/${selectedFile.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });

    // update local list without a full reload
    setFiles((prev) => prev.map((x) => (x.id === updated.id ? { ...x, name: updated.name } : x)));

    setRenameOpen(false);
  } catch (e: any) {
    setRenameUiErr(e?.message || String(e));
  } finally {
    setFileOpBusy(null);
  }
}

async function renameSelectedFile() {
  openRenameModal();
}

async function deleteSelectedFile() {
  if (!selectedFile || !selectedProjectId) return;

  const ok = typeof window !== "undefined"
    ? window.confirm(`Delete "${selectedFile.name}"?

This deletes the file and all its versions.`)
    : false;
  if (!ok) return;

  setPreviewErr(null);
  setFileOpBusy("delete");
  try {
    await apiFetch<{ ok: boolean }>(`/files/${selectedFile.id}`, { method: "DELETE" });
    await loadFiles(selectedProjectId);
  } catch (e: any) {
    setPreviewErr(e?.message || String(e));
  } finally {
    setFileOpBusy(null);
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
    <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "360px 260px 1fr",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* LEFT: project categories */}
      <div
        style={{
          display: isMobile && mobileView !== "projects" ? "none" : "block",
          position: isMobile ? "relative" : "sticky",
          top: isMobile ? undefined : 12,
          zIndex: 5,
          alignSelf: "start",
          border: "1px solid #30363d",
          borderRadius: 16,
          background: "#0f1623",
          padding: 12,
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
          colorScheme: "dark",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(120,134,156,0.55) rgba(15,22,35,0.6)",
          overflowX: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 10 }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Projects</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>
            <button
              onClick={() => { setNewErr(null); setNewOpen(true); }}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "#1f6feb",
                color: "#e6edf3",
                fontWeight: 900,
              }}
            >
              + New
            </button>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={decProjCardSize}
                title="Smaller cards"
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                −
              </button>

              <div style={{ minWidth: 64, textAlign: "center", opacity: 0.75, fontSize: 12, fontWeight: 900 }}>
                {projCardSize === "large" ? "Large" : projCardSize === "medium" ? "Medium" : "Small"}
              </div>

              <button
                onClick={incProjCardSize}
                title="Larger cards"
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>



            <button
              onClick={loadAll}
              style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", whiteSpace: "nowrap", flex: "0 0 auto" }}
            >
              Refresh
            </button>
          </div>
        </div>

        <input
          value={projQ}
          onChange={(e) => setProjQ(e.target.value)}
          placeholder="Search projects..."
          style={{
            width: "100%",
            marginTop: 10,
            boxSizing: "border-box",
            display: "block",
            padding: 10,
            borderRadius: 12,
            border: "1px solid #30363d",
            background: "#0b0f17",
            color: "#e6edf3",
            fontSize: 14,
          }}
        />


        {err && <div style={{ color: "#ff7b72", marginTop: 10 }}>{err}</div>}
        {thumbPickOpen && (
          <div
            onClick={() => {
              if (thumbPickBusy || thumbSavingProjectId) return;
              setThumbPickOpen(false);
              setThumbPickProjectId(null);
              setThumbPickFiles([]);
              setThumbPickErr(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 30000,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(820px, 96vw)",
                maxHeight: "80vh",
                overflow: "auto",
                borderRadius: 16,
                border: "1px solid #30363d",
                background: "#0b0f17",
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 10 }}>
                <div style={{ fontWeight: 950 }}>Choose thumbnail (from this project)</div>
                <button
                  disabled={thumbPickBusy || !!thumbSavingProjectId}
                  onClick={() => {
                    setThumbPickOpen(false);
                    setThumbPickProjectId(null);
                    setThumbPickFiles([]);
                    setThumbPickErr(null);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #30363d",
                    background: "#0f1623",
                    color: "#e6edf3",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              {thumbPickErr && <div style={{ color: "#ff7b72", marginTop: 10 }}>{thumbPickErr}</div>}

              {thumbPickBusy ? (
                <div style={{ marginTop: 14, opacity: 0.75 }}>Loading images…</div>
              ) : thumbPickFiles.length === 0 ? (
                <div style={{ marginTop: 14, opacity: 0.75 }}>
                  No images found in this project yet. Upload images to the project first, then pick one here.
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {thumbPickFiles.map((f) => {
                    const fid = String(f.id);
                    const url = `/api/files/${fid}/preview`;
                    return (
                      <button
                        key={fid}
                        disabled={!!thumbSavingProjectId}
                        onClick={() => {
                          if (!thumbPickProjectId) return;
                          void setThumbnail(thumbPickProjectId, fid);
                        }}
                        title={f.name}
                        style={{
                          textAlign: "left",
                          borderRadius: 14,
                          border: "1px solid #30363d",
                          background: "#0f1623",
                          color: "#e6edf3",
                          padding: 8,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "1 / 1",
                            borderRadius: 12,
                            overflow: "hidden",
                            border: "1px solid #30363d",
                            background: "#0b0f17",
                          }}
                        >
                          <img
                            src={url}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {STATUS_ORDER.map((st) => {
            const items = grouped[st] || [];
            return (
              <details
                key={st}
                open
                data-drop-status={st}
                style={{
                  border: "1px solid #30363d",
                  borderRadius: 14,
                  background: "#0b0f17",
                  outline: hoverStatus === st ? "2px solid #3b82f6" : "none",
                  outlineOffset: 2,
                }}
              >
                <summary style={{ cursor: "pointer", padding: "10px 10px", display: "flex", justifyContent: "space-between", userSelect: "none" }}>
                  <div style={{ fontWeight: 900 }}>{STATUS_TITLES[st]}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{items.length}</div>
                </summary>

                <div
                  style={{
                    padding: "0 8px 8px",
                    display: projCardSize === "small" ? "grid" : "flex",
                    gridTemplateColumns: projCardSize === "small" ? "repeat(2, minmax(0, 1fr))" : undefined,
                    flexDirection: projCardSize === "small" ? undefined : "column",
                    gap: projCardSize === "small" ? 10 : 6,
                  }}
                >
                  {items.length === 0 ? (
                    <div style={{ opacity: 0.6, fontSize: 12, padding: "2px 4px" }}>No projects</div>
                  ) : (
                    items.map((p) => {
                      const selected = p.id === selectedProjectId;
                      const thumbId = (p as any).thumbnail_file_id || null;
                      return (
                        <button
                          key={p.id}
                          onPointerDown={(e) => startPointerDrag(e, p)}
                          onPointerMove={movePointerDrag}
                          onPointerUp={endPointerDrag}
                          onPointerCancel={endPointerDrag}
                          onClick={() => {
                            if (suppressClickRef.current) return;
                            setSelectedProjectId(p.id);
                            setSection("overview");
                            if (isMobile) setMobileView("sections");
                          }}
                          style={{
                            textAlign: "left",
                            width: "100%",
                            padding: 0,
                            borderRadius: 12,
                            overflow: "hidden",
                            border: "1px solid #30363d",
                            background: selected ? "#111827" : "#0f1623",
                            color: "#e6edf3",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ position: "relative", width: "100%", height: projectCardHeight,
 background: "#0b0f17" }}>
                            {thumbSavingProjectId === p.id ? (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.9, fontWeight: 900 }}>...</div>
                            ) : thumbId ? (
                              <img
                                src={thumbId ? `/api/files/${thumbId}/preview` : ""}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              />
                            ) : (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 950, opacity: 0.85 }}>+</div>
                            )}

                            <button
                              onPointerDown={(e) => { e.stopPropagation(); }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMovePicker({ projectId: p.id, name: p.name, from: p.status });
                              }}

                              title="Move project"
                              style={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                width: 34,
                                height: 34,
                                borderRadius: 12,
                                border: "1px solid #30363d",
                                background: "rgba(15,22,35,0.85)",
                                color: "#e6edf3",
                                fontWeight: 950,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                lineHeight: 1,
                              }}
                            >
                              ✎
                            </button>

                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background:
                                  "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.65) 35%, rgba(0,0,0,0.0) 72%)",
                                opacity: 1,
                                pointerEvents: "none",
                              }}
                            />

                            <div
                              style={{
                                position: "absolute",
                                left: 12,
                                right: 12,
                                bottom: 10,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-end",
                                gap: 10,
                                pointerEvents: "none",

                                padding: "8px 10px",
                                borderRadius: 14,
                                background: "rgba(0,0,0,0.18)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)",
                                boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 950,
                                    lineHeight: 1.2,
                                    fontSize: 15,
                                    color: "#ffffff",
                                    textShadow: "0 2px 12px rgba(0,0,0,0.95)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {p.name}
                                </div>

                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, opacity: 0.9, fontSize: 10 }}>
                                  <div>P{p.priority}</div>
                                  {(p.total_amount != null || p.paid_amount != null) ? (
                                    <div style={{ whiteSpace: "nowrap" }}>
                                      Paid {fmtMoney(p.paid_amount)}/{fmtMoney(p.total_amount)}
                                    </div>
                                  ) : null}
                                  {p.eta_date ? <div style={{ whiteSpace: "nowrap" }}>ETA {fmtDateShort(p.eta_date)}</div> : null}
                                </div>
                              </div>

                              <div style={{ whiteSpace: "nowrap", opacity: 0.95, fontSize: 11, color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>
                                {fmtUpdatedAt(p.updated_at)}
                              </div>
                            </div>
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


      {/* Drag ghost */}
      {dragging ? (
        <div
          style={{
            position: "fixed",
            left: dragging.x + 12,
            top: dragging.y + 12,
            zIndex: 9999,
            pointerEvents: "none",
            width: 280,
            borderRadius: 12,
            border: "1px solid #30363d",
            background: "#0f1623",
            color: "#e6edf3",
            padding: "10px 10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ fontWeight: 900, lineHeight: 1.2, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {dragging.name}
          </div>
          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
            Move to: {hoverStatus ? STATUS_TITLES[hoverStatus] : "—"}
          </div>
        </div>
      ) : null}

      {movePicker ? (
        <div
          onMouseDown={() => setMovePicker(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 560,
              maxWidth: "100%",
              borderRadius: 16,
              border: "1px solid #30363d",
              background: "#0b0f17",
              color: "#e6edf3",
              padding: 16,
              boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>Move project</div>
            <div style={{ marginTop: 8, opacity: 0.85, lineHeight: 1.35, fontSize: 12 }}>
              <span style={{ fontWeight: 900 }}>{movePicker.name}</span> — currently{" "}
              <span style={{ fontWeight: 900 }}>{STATUS_TITLES[movePicker.from]}</span>
            </div>

            {/* Sorted list (top -> bottom) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {STATUS_ORDER.map((s) => {
                const disabled = s === movePicker.from;
                const sk = String(s);

                const label =
                  sk === "current" ? "Current Projects" :
                  sk === "finished" ? "Finished Projects" :
                  sk === "rejected" ? "Rejected Projects" :
                  STATUS_TITLES[s];

                return (
                  <button
                    key={sk}
                    disabled={disabled}
                    onClick={() => {
                      setMovePicker(null);
                      setConfirmMove({
                        projectId: movePicker.projectId,
                        name: movePicker.name,
                        from: movePicker.from,
                        to: s,
                      });
                    }}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid #30363d",
                      background: disabled ? "rgba(15,22,35,0.55)" : "#0f1623",
                      color: "#e6edf3",
                      cursor: disabled ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: disabled ? 0.55 : 1,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ opacity: 0.65, fontWeight: 900 }}>›</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14 }}>
              {/* Different style: dashed / ghost */}
              <button
                onClick={() => {
                  setMovePicker(null);
                  openThumbPicker(movePicker.projectId);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px dashed rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "rgba(230,237,243,0.92)",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Change thumbnail
              </button>

              <button
                onClick={() => setMovePicker(null)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modern confirmation modal */}
      {confirmMove ? (
        <div
          onMouseDown={() => setConfirmMove(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: "100%",
              borderRadius: 16,
              border: "1px solid #30363d",
              background: "#0b0f17",
              color: "#e6edf3",
              padding: 16,
              boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>Move project?</div>
            <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.35 }}>
              Move <span style={{ fontWeight: 900 }}>{confirmMove.name}</span> from{" "}
              <span style={{ fontWeight: 900 }}>{STATUS_TITLES[confirmMove.from]}</span> to{" "}
              <span style={{ fontWeight: 900 }}>{STATUS_TITLES[confirmMove.to]}</span>?
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => setConfirmMove(null)}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", cursor: "pointer", fontWeight: 800 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmMoveYes}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #3b82f6", background: "#1d4ed8", color: "#ffffff", cursor: "pointer", fontWeight: 900 }}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MIDDLE: sections inside project */}
      <div
        style={{
          display: isMobile && mobileView !== "sections" ? "none" : "block",
          position: isMobile ? "relative" : "sticky",
          top: isMobile ? undefined : 12,

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
            {isMobile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <button
                  onClick={() => setMobileView("projects")}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: "1px solid #30363d",
                    background: "#0b0f17",
                    color: "#e6edf3",
                    fontWeight: 950,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    flex: "0 0 auto",
                  }}
                  title="Back"
                >
                  ←
                </button>

                <div
                  style={{
                    fontWeight: 950,
                    fontSize: 14,
                    lineHeight: 1.25,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedProject.name}
                </div>
              </div>
            ) : (
              <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.25 }}>{selectedProject.name}</div>
            )}
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>{STATUS_TITLES[selectedProject.status] || selectedProject.status}</div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {SECTION_ORDER.map((k) => {
                const active = k === section;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setSection(k);
                      if (isMobile) setMobileView("files");
                    }}
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
                    <div style={{ opacity: 0.6, fontSize: 12 }}>{">"}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: work area */}
      <div
        style={{
          border: "1px solid #30363d",
          borderRadius: 16,
          background: "#0f1623",
          padding: 14,
          minHeight: 560,
          display: isMobile && mobileView !== "files" ? "none" : "block",
        }}
      >
        {!selectedProject ? (
          <div style={{ opacity: 0.75 }}>Pick a project from the left.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {isMobile ? (
                  <button
                    onClick={() => setMobileView("sections")}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      border: "1px solid #30363d",
                      background: "#0b0f17",
                      color: "#e6edf3",
                      fontWeight: 950,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                      flex: "0 0 auto",
                    }}
                    title="Back"
                  >
                    ←
                  </button>
                ) : null}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>Workspace</div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    {selectedProject.name} - {SECTION_TITLES[section]}
                  </div>
                </div>
              </div>


              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => renameSelectedProject()}
                  disabled={!selectedProjectId}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid #30363d",
                    background: "#0b0f17",
                    color: "#e6edf3",
                    opacity: !selectedProjectId ? 0.6 : 1,
                    cursor: !selectedProjectId ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  Rename
                </button>

                <button
                  onClick={() => deleteSelectedProject()}
                  disabled={!selectedProjectId}
                  title="Delete this project and all its files"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid #30363d",
                    background: "#3b0a0a",
                    color: "#ffd7d7",
                    fontWeight: 900,
                    opacity: !selectedProjectId ? 0.6 : 1,
                    cursor: !selectedProjectId ? "not-allowed" : "pointer",
                  }}
                >
                  Delete Project
                </button>
              </div>

              {/* Open project button removed (unused) */}
            </div>
            {/* Version history moved into Preview (collapsible) */}

            {(filesErr || previewErr || uploadErr) && (
            <div style={{ color: "#ff7b72", marginTop: 12 }}>
                {filesErr || previewErr || uploadErr}
            </div>
            )}

            {section === "overview" && selectedProject ? (
              <details style={{ marginTop: 14, border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17" }}>
                <summary
                  style={{
                    padding: 12,
                    cursor: "pointer",
                    userSelect: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 15 }}>Project Setup</div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", opacity: 0.72, fontSize: 12 }}>
                      <div style={{ whiteSpace: "nowrap" }}>
                        Paid {fmtMoney(selectedProject.paid_amount)}/{fmtMoney(selectedProject.total_amount)}
                      </div>
                      <div style={{ opacity: 0.6 }}>•</div>
                      <div style={{ whiteSpace: "nowrap" }}>
                        Balance {fmtMoney(calcBalance(selectedProject.total_amount, selectedProject.paid_amount))}
                      </div>
                      <div style={{ opacity: 0.6 }}>•</div>
                      <div style={{ whiteSpace: "nowrap" }}>
                        ETA {fmtDateShort(selectedProject.eta_date)}
                      </div>
                    </div>
                  </div>

                  <div style={{ opacity: 0.7, fontSize: 14 }}>▾</div>
                </summary>

                <div style={{ padding: 12, paddingTop: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Edit payments, delivery & inventory then Save.</div>

                    <button
                      onClick={() => saveProjectSetup()}
                      disabled={setupBusy}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: "1px solid #30363d",
                        background: setupBusy ? "#111827" : "#1f6feb",
                        color: "#e6edf3",
                        fontWeight: 900,
                        cursor: setupBusy ? "not-allowed" : "pointer",
                        opacity: setupBusy ? 0.7 : 1,
                      }}
                    >
                      {setupBusy ? "Saving..." : "Save"}
                    </button>
                  </div>

                  {setupMsg ? (
                    <div style={{ marginTop: 10, opacity: setupMsg === "Saved." ? 0.75 : 1, color: setupMsg === "Saved." ? "#7ee787" : "#ff7b72" }}>
                      {setupMsg}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {/* Payments */}
                    <div style={{ border: "1px solid #30363d", borderRadius: 12, background: "#0f1623", padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Payments</div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 12, opacity: 0.75 }}>Total (QAR)</label>
                        <input
                          value={setupTotal}
                          onChange={(e) => setSetupTotal(e.target.value)}
                          placeholder="e.g. 5700"
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                        />

                        <label style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Paid (QAR)</label>
                        <input
                          value={setupPaid}
                          onChange={(e) => setSetupPaid(e.target.value)}
                          placeholder="e.g. 2850"
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                        />

                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                          <div>Balance</div>
                          <div style={{ fontWeight: 900 }}>
                            {fmtMoney(calcBalance(setupTotal === "" ? null : Number(setupTotal), setupPaid === "" ? null : Number(setupPaid)))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delivery */}
                    <div style={{ border: "1px solid #30363d", borderRadius: 12, background: "#0f1623", padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Delivery</div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 12, opacity: 0.75 }}>Payment date</label>
                        <input
                          type="date"
                          value={setupPaymentDate}
                          onChange={(e) => setSetupPaymentDate(e.target.value)}
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                        />

                        <label style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Max days to deliver</label>
                        <input
                          value={setupMaxDays}
                          onChange={(e) => setSetupMaxDays(e.target.value)}
                          placeholder="e.g. 16"
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                        />

                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                          <div>ETA (skip Fridays)</div>
                          <div style={{ fontWeight: 900 }}>{fmtDateShort(selectedProject.eta_date)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Inventory */}
                    <div style={{ border: "1px solid #30363d", borderRadius: 12, background: "#0f1623", padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Inventory</div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {[
                          ["bom_prepared", "BOM prepared"],
                          ["wood_received", "Wood received"],
                          ["hardware_received", "Hardware received"],
                          ["ready_for_cutting", "Ready for cutting"],
                        ].map(([k, label]) => (
                          <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.9 }}>
                            <input
                              type="checkbox"
                              checked={!!setupInv?.[k]}
                              onChange={(e) => setSetupInv((p) => ({ ...(p || {}), [k]: e.target.checked }))}
                            />
                            {label}
                          </label>
                        ))}

                        <label style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>Missing items (one per line)</label>
                        <textarea
                          value={setupMissing}
                          onChange={(e) => setSetupMissing(e.target.value)}
                          rows={3}
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", resize: "vertical" }}
                        />

                        <label style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Notes</label>
                        <textarea
                          value={setupNotes}
                          onChange={(e) => setSetupNotes(e.target.value)}
                          rows={2}
                          style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", resize: "vertical" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            ) : null}

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "0.9fr 1.1fr", gap: 14, alignItems: "start" }}>
            {/* Files list */}
            <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 520 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>Files • {SECTION_TITLES[section]}</div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>
                  <input
                    id="uploadInput"
                    type="file"
                    multiple
                    style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                    onChange={(e) => {
                      const fl = e.target.files;
                      if (!fl || fl.length === 0) return;

                      const arr = Array.from(fl);
                      const picked = arr.map((x) => x.name).join(", ");
                      setUploadErr(`Picked: ${picked}`);

                      e.target.value = "";

                      (async () => {
                        for (const f of arr) {
                          await uploadToSelectedProject(f);
                        }
                      })().catch((err: any) => {
                        setUploadErr(err?.message || String(err));
                      });
                    }}
                  />


                  <label
                    htmlFor="uploadInput"
                    onClick={(e) => {
                      if (!selectedProjectId || uploading) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #30363d",
                      background: uploading ? "#111827" : "#1f6feb",
                      color: "#e6edf3",
                      fontWeight: 900,
                      cursor: !selectedProjectId || uploading ? "not-allowed" : "pointer",
                      opacity: !selectedProjectId || uploading ? 0.6 : 1,
                      userSelect: "none",
                      display: "inline-block",
                    }}
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </label>

                  <button
                    onClick={() => (selectedProjectId ? loadFiles(selectedProjectId) : null)}
                    style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                  >
                    Refresh
                  </button>
                </div>
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
                            setViewVersionId(null);
                            setViewVersionNo(null);
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
                          <div
                            style={{
                              fontWeight: 900,
                              overflow: "hidden",
                              textOverflow: "ellipsis",

                              // Mobile: 2 lines max (no horizontal drag)
                              display: isMobile ? "-webkit-box" : "block",
                              WebkitLineClamp: isMobile ? 2 : undefined,
                              WebkitBoxOrient: isMobile ? "vertical" : undefined,
                              whiteSpace: isMobile ? "normal" : "nowrap",
                              wordBreak: "break-word",
                              lineHeight: 1.25,
                            }}
                            title={f.name}
                          >
                            {isMobile ? midEllipsisKeepExt(f.name, 46) : f.name}
                          </div>

                          <div style={{ opacity: 0.75, fontSize: 12, whiteSpace: "nowrap" }}>
                            {f.kind} - {extOf(f.name) || extFromMime(f.mime) || "file"} - {fmtSize(f.size_bytes)}
                          </div>
                        </div>
                        <div style={{ opacity: 0.7, fontSize: 12, whiteSpace: "nowrap" }}>{busyFileId === f.id ? "..." : ""}</div>
                        </button>
                    );
                    })
                )}
                </div>
            </div>

            {/* Preview */}
            <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 520 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>Preview</div>

                  {viewVersionNo ? (
                    <button
                      onClick={() => viewLatest()}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 12,
                        border: "1px solid #30363d",
                        background: "#0f1623",
                        color: "#e6edf3",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Back to latest
                    </button>
                  ) : null}
                </div>

                {selectedFile && (
                  <details
                    style={{
                      marginTop: 10,
                      border: "1px solid #30363d",
                      borderRadius: 14,
                      background: "#0f1623",
                      overflow: "hidden",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        userSelect: "none",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>History</div>
                      <div style={{ opacity: 0.75, fontSize: 12, whiteSpace: "nowrap" }}>
                        {viewVersionNo ? `Viewing v${viewVersionNo}` : `${versions.length} versions`}
                      </div>
                    </summary>

                    <div style={{ padding: 10, display: "grid", gap: 8 }}>
                      {versionsErr && <div style={{ color: "#ff7b72" }}>{versionsErr}</div>}

                      {versions.length === 0 ? (
                        <div style={{ opacity: 0.75 }}>No previous versions yet.</div>
                      ) : (
                        versions.map((v) => {
                          const active = viewVersionId === v.id;
                          return (
                            <div
                              key={v.id}
                              onClick={() => viewVersion(v)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                padding: 10,
                                borderRadius: 12,
                                border: active ? "1px solid #1f6feb" : "1px solid #30363d",
                                background: active ? "#111827" : "#0b1220",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ opacity: 0.9, minWidth: 0 }}>
                                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  v{v.version_no}
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
                                </div>
                              </div>

                              <button
                                onClick={(e) => { e.stopPropagation(); openVersion(v.id); }}
                                disabled={busyVer === v.id}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 12,
                                  border: "1px solid #30363d",
                                  background: "#0b0f17",
                                  color: "#e6edf3",
                                  fontWeight: 900,
                                }}
                              >
                                {busyVer === v.id ? "..." : "Open"}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </details>
                )}

                {!selectedFile ? (
                <div style={{ opacity: 0.75, marginTop: 10 }}>Select a file.</div>
                ) : (
                <>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                      <div style={{ fontWeight: 900, lineHeight: 1.25 }}>{selectedFile.name}</div>
                      {viewVersionNo ? (
                        <div style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #30363d", background: "#0f1623", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
                          v{viewVersionNo}
                        </div>
                      ) : null}
                    </div>
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
                                Browser can't render {isXlsx ? "XLS/XLSX" : "DOC/DOCX"} directly. Use Open (main) or Download.
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

                            const resp = await fetch("http://127.0.0.1:17832/open", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                api_base: "http://api:8000",
                                token:
                                  (typeof window !== "undefined" &&
                                    (localStorage.getItem("access_token") ||
                                      localStorage.getItem("token") ||
                                      localStorage.getItem("auth_token"))) ||
                                  null,
                 // uses your existing token var
                                file_id: selectedFile.id,
                                filename: selectedFile.name,
                                mime: selectedFile.mime || null,
                                download_url: r.url,
                                watch: true,                          // auto-upload when saved (if token exists)
                              }),
                            });

                            if (!resp.ok) {
                              const t = await resp.text();
                              throw new Error(`Local helper error (${resp.status}): ${t}`);
                            }
                          } catch (e: any) {
                            // fallback: still open in browser if helper isn't running
                            setPreviewErr((e?.message || String(e)) + " | Start tools/open_helper.py then try again.");
                            try {
                              const r2 = await apiFetch<{ url: string }>(`/files/${selectedFile.id}/presign-download`, { method: "POST" });
                              window.open(r2.url, "_blank", "noopener,noreferrer");
                            } catch {}
                          }
                        }}


                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "white", fontWeight: 900 }}
                    >
                        Open
                    </button>

                    <button
                        onClick={() => renameSelectedFile()}
                        disabled={fileOpBusy !== null}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 900, opacity: fileOpBusy ? 0.6 : 1, cursor: fileOpBusy ? "not-allowed" : "pointer" }}
                    >
                        Rename
                    </button>

                    <button
                        onClick={() => deleteSelectedFile()}
                        disabled={fileOpBusy !== null}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#7f1d1d", color: "#ffffff", fontWeight: 900, opacity: fileOpBusy ? 0.6 : 1, cursor: fileOpBusy ? "not-allowed" : "pointer" }}
                    >
                        Delete
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


      {newOpen && (
        <div
          onClick={() => { if (!newBusy) { setNewOpen(false); setNewErr(null); } }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              border: "1px solid #30363d",
              borderRadius: 16,
              background: "#0b0f17",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>New project</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
              It will always be created in <span style={{ fontWeight: 900 }}>Under Preparation</span>.
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (!newBusy) { setNewOpen(false); setNewErr(null); }
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!newBusy) createNewProject();
                  }
                }}
                placeholder="Project name"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontSize: 14,
                }}
              />
            </div>

            {newErr ? <div style={{ color: "#ff7b72", marginTop: 10 }}>{newErr}</div> : null}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { if (!newBusy) { setNewOpen(false); setNewErr(null); } }}
                disabled={newBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontWeight: 900,
                  opacity: newBusy ? 0.6 : 1,
                  cursor: newBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => createNewProject()}
                disabled={newBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#1f6feb",
                  color: "white",
                  fontWeight: 900,
                  opacity: newBusy ? 0.6 : 1,
                  cursor: newBusy ? "not-allowed" : "pointer",
                }}
              >
                {newBusy ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {projRenameOpen && selectedProject && (
        <div
          onClick={() => { if (!projRenameBusy) { setProjRenameOpen(false); setProjRenameErr(null); } }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              border: "1px solid #30363d",
              borderRadius: 16,
              background: "#0b0f17",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>Rename project</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
              Current: <span style={{ fontWeight: 900 }}>{selectedProject.name}</span>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                autoFocus
                value={projRenameDraft}
                onChange={(e) => setProjRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (!projRenameBusy) { setProjRenameOpen(false); setProjRenameErr(null); }
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!projRenameBusy) commitProjectRename();
                  }
                }}
                placeholder="Project name"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontSize: 14,
                }}
              />
            </div>

            {projRenameErr ? <div style={{ color: "#ff7b72", marginTop: 10 }}>{projRenameErr}</div> : null}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { if (!projRenameBusy) { setProjRenameOpen(false); setProjRenameErr(null); } }}
                disabled={projRenameBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontWeight: 900,
                  opacity: projRenameBusy ? 0.6 : 1,
                  cursor: projRenameBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => commitProjectRename()}
                disabled={projRenameBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#1f6feb",
                  color: "white",
                  fontWeight: 900,
                  opacity: projRenameBusy ? 0.6 : 1,
                  cursor: projRenameBusy ? "not-allowed" : "pointer",
                }}
              >
                {projRenameBusy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {projDeleteOpen && selectedProject && (
        <div
          onClick={() => { if (!projDeleteBusy) setProjDeleteOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              border: "1px solid #30363d",
              borderRadius: 16,
              background: "#0b0f17",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>Delete project?</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
              This will delete <span style={{ fontWeight: 900 }}>{selectedProject.name}</span> and <span style={{ fontWeight: 900 }}>ALL</span> its files.
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { if (!projDeleteBusy) setProjDeleteOpen(false); }}
                disabled={projDeleteBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontWeight: 900,
                  opacity: projDeleteBusy ? 0.6 : 1,
                  cursor: projDeleteBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteSelectedProject()}
                disabled={projDeleteBusy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#7f1d1d",
                  color: "#ffffff",
                  fontWeight: 900,
                  opacity: projDeleteBusy ? 0.6 : 1,
                  cursor: projDeleteBusy ? "not-allowed" : "pointer",
                }}
              >
                {projDeleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && selectedFile && (
        <div
          onClick={() => {
            if (!fileOpBusy) {
              setRenameOpen(false);
              setRenameUiErr(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              border: "1px solid #30363d",
              borderRadius: 16,
              background: "#0b0f17",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16 }}>Rename file</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
              Extension is fixed: <span style={{ fontWeight: 900 }}>{renameExt || "(none)"}</span>
            </div>
            <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6, wordBreak: "break-word" }}>
              Current: <span style={{ fontWeight: 900 }}>{selectedFile.name}</span>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (!fileOpBusy) {
                      setRenameOpen(false);
                      setRenameUiErr(null);
                    }
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!fileOpBusy) commitRename();
                  }
                }}
                placeholder="File name"
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontSize: 14,
                }}
              />
              {renameExt ? (
                <div
                  style={{
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid #30363d",
                    background: "#0f1623",
                    color: "#e6edf3",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {renameExt}
                </div>
              ) : null}
            </div>

            {renameUiErr ? <div style={{ color: "#ff7b72", marginTop: 10 }}>{renameUiErr}</div> : null}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => {
                  if (!fileOpBusy) {
                    setRenameOpen(false);
                    setRenameUiErr(null);
                  }
                }}
                disabled={fileOpBusy !== null}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#0f1623",
                  color: "#e6edf3",
                  fontWeight: 900,
                  opacity: fileOpBusy ? 0.6 : 1,
                  cursor: fileOpBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => commitRename()}
                disabled={fileOpBusy !== null}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#1f6feb",
                  color: "white",
                  fontWeight: 900,
                  opacity: fileOpBusy ? 0.6 : 1,
                  cursor: fileOpBusy ? "not-allowed" : "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

