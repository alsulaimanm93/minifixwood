"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ItemRow = { id: string; sku: string; name: string; type: string; uom: string };

type ProjectRow = { id: string; project_no?: number | null; name: string; status: string };

type SheetLotView = {
  id: string;
  material_item_id: string;
  material_sku: string;
  material_name: string;
  thickness_mm?: number | null;
  w_mm: number;
  h_mm: number;
  qty: number;
  usable: boolean;
  location?: string | null;
  tag_code?: string | null;
  project_origin_id?: string | null;
  reserved_for_project_id?: string | null;
  source: string;
  unit_cost?: number | null;
  created_at: string;
};

export default function SheetsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // filter
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  // material picker
  const [matQ, setMatQ] = useState("");
  const [matHits, setMatHits] = useState<ItemRow[]>([]);
  const [material, setMaterial] = useState<ItemRow | null>(null);

  // projects for reserve
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [reserveProjectId, setReserveProjectId] = useState<string>("");

  // create lot form
  const [thk, setThk] = useState<number>(18);
  const [w, setW] = useState<number>(2440);
  const [h, setH] = useState<number>(1220);
  const [qty, setQty] = useState<number>(1);
  const [location, setLocation] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState<"purchase" | "remnant" | "adjustment">("purchase");

  const [lots, setLots] = useState<SheetLotView[]>([]);

  async function loadProjects() {
    try {
      const r = await apiFetch<ProjectRow[]>("/projects/all", { method: "GET" });
      setProjects(r || []);
    } catch {
      setProjects([]);
    }
  }

  async function loadLots() {
    setErr(null);
    try {
      const qs: string[] = [];
      if (material?.id) qs.push(`material_item_id=${encodeURIComponent(material.id)}`);
      qs.push(`only_available=${onlyAvailable ? "true" : "false"}`);
      const url = `/inventory/sheets/view?${qs.join("&")}`;
      const r = await apiFetch<SheetLotView[]>(url, { method: "GET" });
      setLots(r || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function searchMaterials(term: string) {
    setMatQ(term);
    setMaterial(null);
    const t = term.trim();
    if (!t) {
      setMatHits([]);
      return;
    }
    try {
      // Search items and pick ones that are type=sheet
      const r = await apiFetch<ItemRow[]>(`/inventory/items/search?q=${encodeURIComponent(t)}&limit=20`, { method: "GET" });
      setMatHits((r || []).filter((x) => x.type === "sheet"));
    } catch {
      setMatHits([]);
    }
  }

  async function createLot() {
    if (!material) {
      setErr("Pick a material (sheet SKU) first.");
      return;
    }
    if (w <= 0 || h <= 0 || qty <= 0) {
      setErr("Invalid size/qty.");
      return;
    }

    setBusy("create");
    setErr(null);
    try {
      await apiFetch("/inventory/sheets", {
        method: "POST",
        body: JSON.stringify({
          material_item_id: material.id,
          thickness_mm: Number(thk) || null,
          w_mm: Number(w),
          h_mm: Number(h),
          qty: Number(qty),
          usable: true,
          location: location.trim() || null,
          tag_code: tag.trim() || null,
          project_origin_id: null,
          source,
          unit_cost: null,
        }),
      });

      setW(2440);
      setH(1220);
      setQty(1);
      setLocation("");
      setTag("");
      setSource("purchase");
      await loadLots();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reserve(sheetId: string) {
    if (!reserveProjectId) {
      setErr("Choose a project to reserve to.");
      return;
    }
    setBusy(`res:${sheetId}`);
    setErr(null);
    try {
      await apiFetch(`/inventory/sheets/${sheetId}/reserve`, {
        method: "PUT",
        body: JSON.stringify({ project_id: reserveProjectId }),
      });
      await loadLots();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function unreserve(sheetId: string) {
    setBusy(`unres:${sheetId}`);
    setErr(null);
    try {
      await apiFetch(`/inventory/sheets/${sheetId}/unreserve`, { method: "PUT" });
      await loadLots();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    loadProjects();
    loadLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyAvailable, material?.id]);

  const border = "1px solid #30363d";
  const cardBg = "rgba(255,255,255,0.03)";

  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Sheets & Remnants</h1>
      {err && <div style={{ color: "#ffb4b4", marginBottom: 10 }}>{err}</div>}

      {/* Filters */}
      <div style={{ border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Filters</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 160px", gap: 10, alignItems: "center" }}>
          <div>
            <input
              value={matQ}
              onChange={(e) => searchMaterials(e.target.value)}
              placeholder="Search material (sheet SKU) e.g. MDF 18 / Oak 18…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
            />
            {matHits.length > 0 && !material && (
              <div style={{ marginTop: 8, border, borderRadius: 12, overflow: "hidden" }}>
                {matHits.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setMaterial(it);
                      setMatHits([]);
                      setMatQ(`${it.sku} — ${it.name}`);
                    }}
                    style={{ width: "100%", textAlign: "left", border: "none", borderBottom: border, padding: "10px 12px", background: "rgba(0,0,0,0.12)", color: "inherit", cursor: "pointer" }}
                  >
                    <div style={{ fontWeight: 900 }}>{it.sku}</div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>{it.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={reserveProjectId}
            onChange={(e) => setReserveProjectId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
          >
            <option value="">Reserve to project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_no ? `#${p.project_no} ` : ""}{p.name}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.9 }}>
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            Only available
          </label>
        </div>
      </div>

      {/* Add sheet / remnant lot */}
      <div style={{ marginTop: 12, border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Add sheet / remnant lot</div>

        <div style={{ display: "grid", gridTemplateColumns: "140px 140px 140px 120px 180px 180px 160px 140px", gap: 10 }}>
          <input type="number" value={thk} onChange={(e) => setThk(Number(e.target.value))} placeholder="thk mm"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} placeholder="W mm"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} placeholder="H mm"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="qty"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="location"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag/label (optional)"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

          <select value={source} onChange={(e) => setSource(e.target.value as any)}
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
            <option value="purchase">purchase</option>
            <option value="remnant">remnant</option>
            <option value="adjustment">adjustment</option>
          </select>

          <button onClick={createLot} disabled={busy != null}
            style={{ border, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
            Add
          </button>
        </div>

        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
          Important: pick the material (sheet SKU) in Filters first, then add lots.
        </div>
      </div>

      {/* Lots list */}
      <div style={{ marginTop: 12, border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>Lots</div>
          <button onClick={loadLots} disabled={busy != null}
            style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 800 }}>
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {lots.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No sheet/remnant lots yet.</div>
          ) : (
            lots.map((l) => (
              <div key={l.id} style={{ border, borderRadius: 14, padding: 10, background: "rgba(0,0,0,0.12)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>
                    {l.material_sku} — {l.material_name}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {l.thickness_mm ? `${l.thickness_mm}mm • ` : ""}{l.w_mm}×{l.h_mm} • qty {l.qty} • {l.source}
                    {l.location ? ` • ${l.location}` : ""}
                    {l.tag_code ? ` • tag: ${l.tag_code}` : ""}
                    {l.reserved_for_project_id ? ` • reserved` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {!l.reserved_for_project_id ? (
                    <button onClick={() => reserve(l.id)} disabled={busy != null}
                      style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(47,129,247,0.15)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
                      Reserve
                    </button>
                  ) : (
                    <button onClick={() => unreserve(l.id)} disabled={busy != null}
                      style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,0,0,0.10)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
                      Unreserve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
