"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
};

type StockLotView = {
  id: string;
  item_id: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
  location?: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  unit_cost?: number | null;
  source: string;
  ref?: string | null;
  created_at: string;
};

export default function StockLotsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [itemQ, setItemQ] = useState("");
  const [hits, setHits] = useState<ItemRow[]>([]);
  const [picked, setPicked] = useState<ItemRow | null>(null);

  const [qty, setQty] = useState<number>(1);
  const [location, setLocation] = useState("");
  const [unitCost, setUnitCost] = useState<number>(0);
  const [ref, setRef] = useState("");

  const [lots, setLots] = useState<StockLotView[]>([]);

  async function searchItems(term: string) {
    setItemQ(term);
    setPicked(null);
    const t = term.trim();
    if (!t) {
      setHits([]);
      return;
    }
    try {
      const r = await apiFetch<ItemRow[]>(
        `/inventory/items/search?q=${encodeURIComponent(t)}&limit=15`,
        { method: "GET" }
      );
      setHits(r || []);
    } catch {
      setHits([]);
    }
  }

  async function loadLots() {
    setErr(null);
    try {
      const r = await apiFetch<StockLotView[]>("/inventory/stock/view", { method: "GET" });
      setLots(r || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function receive() {
    if (!picked) {
      setErr("Pick an item first.");
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      setErr("Qty must be > 0");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/inventory/stock/receive", {
        method: "POST",
        body: JSON.stringify({
          item_id: picked.id,
          qty: q,
          location: location.trim() || null,
          unit_cost: unitCost > 0 ? unitCost : null,
          ref: ref.trim() || null,
        }),
      });

      setPicked(null);
      setItemQ("");
      setHits([]);
      setQty(1);
      setLocation("");
      setUnitCost(0);
      setRef("");
      await loadLots();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadLots();
  }, []);

  const border = "1px solid #30363d";
  const cardBg = "rgba(255,255,255,0.03)";

  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Stock (Lots)</h1>
      {err && <div style={{ color: "#ffb4b4", marginBottom: 10 }}>{err}</div>}

      <div style={{ border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Receive stock (creates a new lot)</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 200px 140px 1fr 140px", gap: 10 }}>
          <div>
            <input
              value={itemQ}
              onChange={(e) => searchItems(e.target.value)}
              placeholder="Search item by SKU / name…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
            />
            {hits.length > 0 && !picked && (
              <div style={{ marginTop: 8, border, borderRadius: 12, overflow: "hidden" }}>
                {hits.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setPicked(it);
                      setHits([]);
                      setItemQ(`${it.sku} — ${it.name}`);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderBottom: border,
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
          </div>

          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            placeholder="Qty"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
          />

          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
          />

          <input
            type="number"
            value={unitCost}
            onChange={(e) => setUnitCost(Number(e.target.value))}
            placeholder="Unit cost"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
          />

          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Ref (invoice/PO #)"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit" }}
          />

          <button
            onClick={receive}
            disabled={busy}
            style={{ border, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", color: "inherit", cursor: busy ? "not-allowed" : "pointer", fontWeight: 900 }}
          >
            Receive
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>Lots</div>
          <button onClick={loadLots} style={{ border, borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: "pointer", fontWeight: 800 }}>
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {lots.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No lots yet.</div>
          ) : (
            lots.map((l) => (
              <div key={l.id} style={{ border, borderRadius: 14, padding: 10, background: "rgba(0,0,0,0.12)" }}>
                <div style={{ fontWeight: 900 }}>
                  {l.sku} — {l.name}
                </div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>
                  {l.type} • on-hand {l.qty_on_hand} • reserved {l.qty_reserved}
                  {l.location ? ` • ${l.location}` : ""}
                  {l.ref ? ` • ref: ${l.ref}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
