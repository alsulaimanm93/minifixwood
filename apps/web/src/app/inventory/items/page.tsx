"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SupplierOut = { id: string; name: string };

type ItemOut = {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  type: "sheet" | "fitting" | "appliance" | "consumable";
  uom: string;
  default_supplier_id?: string | null;
  min_stock?: number | null;
  is_active: boolean;
};

export default function InventoryItemsPage() {
  const [items, setItems] = useState<ItemOut[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOut[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<ItemOut["type"]>("fitting");
  const [uom, setUom] = useState("pcs");
  const [defaultSupplierId, setDefaultSupplierId] = useState<string>("");

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eSku, setESku] = useState("");
  const [eName, setEName] = useState("");
  const [eCategory, setECategory] = useState("");
  const [eType, setEType] = useState<ItemOut["type"]>("fitting");
  const [eUom, setEUom] = useState("pcs");
  const [eDefaultSupplierId, setEDefaultSupplierId] = useState<string>("");
  const [eActive, setEActive] = useState(true);

  const editingRow = useMemo(
    () => items.find((r) => r.id === editingId) || null,
    [items, editingId]
  );

  async function load() {
    setErr(null);
    try {
      const [it, sup] = await Promise.all([
        apiFetch<ItemOut[]>("/inventory/items", { method: "GET" }),
        apiFetch<SupplierOut[]>("/inventory/suppliers", { method: "GET" }),
      ]);
      setItems(it || []);
      setSuppliers((sup || []).map((s: any) => ({ id: s.id, name: s.name })));
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function createItem() {
    setErr(null);
    const s = sku.trim();
    const n = name.trim();
    if (!s || !n) {
      setErr("SKU + Name are required.");
      return;
    }

    setBusy("create");
    try {
      await apiFetch<ItemOut>("/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          sku: s,
          name: n,
          category: category.trim() || null,
          type,
          uom: (uom || "pcs").trim(),
          default_supplier_id: defaultSupplierId || null,
          min_stock: null,
        }),
      });
      setSku("");
      setName("");
      setCategory("");
      setType("fitting");
      setUom("pcs");
      setDefaultSupplierId("");
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function startEdit(it: ItemOut) {
    setEditingId(it.id);
    setESku(it.sku || "");
    setEName(it.name || "");
    setECategory(it.category || "");
    setEType(it.type);
    setEUom(it.uom || "pcs");
    setEDefaultSupplierId(it.default_supplier_id || "");
    setEActive(!!it.is_active);
  }

  function cancelEdit() {
    setEditingId(null);
    setESku("");
    setEName("");
    setECategory("");
    setEType("fitting");
    setEUom("pcs");
    setEDefaultSupplierId("");
    setEActive(true);
  }

  async function saveEdit() {
    if (!editingId) return;
    const s = eSku.trim();
    const n = eName.trim();
    if (!s || !n) {
      setErr("SKU + Name are required.");
      return;
    }

    setErr(null);
    setBusy(`save:${editingId}`);
    try {
      await apiFetch<ItemOut>(`/inventory/items/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          sku: s,
          name: n,
          category: eCategory.trim() || null,
          type: eType,
          uom: (eUom || "pcs").trim(),
          default_supplier_id: eDefaultSupplierId || null,
          min_stock: null,
          is_active: !!eActive,
        }),
      });
      cancelEdit();
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deactivate(id: string) {
    const it = items.find((x) => x.id === id);
    const label = it?.sku ? `Deactivate item "${it.sku}"?` : "Deactivate item?";
    if (!confirm(label)) return;

    setErr(null);
    setBusy(`deact:${id}`);
    try {
      await apiFetch<ItemOut>(`/inventory/items/${id}/deactivate`, { method: "POST" });
      if (editingId === id) cancelEdit();
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const border = "1px solid #30363d";
  const cardBg = "rgba(255,255,255,0.03)";

  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Items (Catalog)</h1>
      {err && <div style={{ color: "#ffb4b4", marginBottom: 10 }}>{err}</div>}

      {/* Add item */}
      <div style={{ border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Add item</div>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 140px 120px 220px 140px", gap: 10 }}>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

          <select value={type} onChange={(e) => setType(e.target.value as any)}
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
            <option value="sheet">sheet</option>
            <option value="fitting">fitting</option>
            <option value="appliance">appliance</option>
            <option value="consumable">consumable</option>
          </select>

          <input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="uom"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

          <select value={defaultSupplierId} onChange={(e) => setDefaultSupplierId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
            <option value="">Default supplier (optional)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <button onClick={createItem} disabled={busy != null}
            style={{ border, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
            Create
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editingRow && (
        <div style={{ marginTop: 12, border, borderRadius: 16, background: "rgba(47,129,247,0.10)", padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Edit item</div>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 140px 120px 220px 120px 120px", gap: 10 }}>
            <input value={eSku} onChange={(e) => setESku(e.target.value)} placeholder="SKU"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
            <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Name"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />
            <input value={eCategory} onChange={(e) => setECategory(e.target.value)} placeholder="Category"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

            <select value={eType} onChange={(e) => setEType(e.target.value as any)}
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
              <option value="sheet">sheet</option>
              <option value="fitting">fitting</option>
              <option value="appliance">appliance</option>
              <option value="consumable">consumable</option>
            </select>

            <input value={eUom} onChange={(e) => setEUom(e.target.value)} placeholder="uom"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }} />

            <select value={eDefaultSupplierId} onChange={(e) => setEDefaultSupplierId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
              <option value="">Default supplier (optional)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select value={eActive ? "1" : "0"} onChange={(e) => setEActive(e.target.value === "1")}
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}>
              <option value="1">active</option>
              <option value="0">inactive</option>
            </select>

            <button onClick={saveEdit} disabled={busy != null}
              style={{ border, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.10)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
              Save
            </button>

            <button onClick={cancelEdit} disabled={busy != null}
              style={{ border, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div style={{ marginTop: 12, border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>Items</div>
          <button onClick={load} disabled={busy != null}
            style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 800 }}>
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {items.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No items yet.</div>
          ) : (
            items.map((it) => (
              <div key={it.id} style={{ border, borderRadius: 14, padding: 10, background: "rgba(0,0,0,0.12)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>
                    {it.sku} — {it.name} {!it.is_active ? <span style={{ opacity: 0.7 }}> (inactive)</span> : null}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {it.type} • {it.uom}{it.category ? ` • ${it.category}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(it)} disabled={busy != null}
                    style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,0.05)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
                    Edit
                  </button>
                  {it.is_active && (
                    <button onClick={() => deactivate(it.id)} disabled={busy != null}
                      style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,0,0,0.10)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}>
                      Deactivate
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
