"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SupplierOut = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export default function SuppliersPage() {
  const [rows, setRows] = useState<SupplierOut[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eEmail, setEEmail] = useState("");

  const editingRow = useMemo(
    () => rows.find((r) => r.id === editingId) || null,
    [rows, editingId]
  );

  async function load() {
    setErr(null);
    try {
      const r = await apiFetch<SupplierOut[]>("/inventory/suppliers", { method: "GET" });
      setRows(r || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function createSupplier() {
    setErr(null);
    const n = name.trim();
    if (!n) {
      setErr("Supplier name is required.");
      return;
    }
    setBusy("create");
    try {
      await apiFetch<SupplierOut>("/inventory/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: n,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: null,
          notes: null,
        }),
      });
      setName("");
      setPhone("");
      setEmail("");
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function startEdit(s: SupplierOut) {
    setEditingId(s.id);
    setEName(s.name || "");
    setEPhone(s.phone || "");
    setEEmail(s.email || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEName("");
    setEPhone("");
    setEEmail("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const n = eName.trim();
    if (!n) {
      setErr("Supplier name is required.");
      return;
    }

    setErr(null);
    setBusy(`save:${editingId}`);
    try {
      await apiFetch<SupplierOut>(`/inventory/suppliers/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: n,
          phone: ePhone.trim() || null,
          email: eEmail.trim() || null,
          address: null,
          notes: null,
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

  async function deleteSupplier(id: string) {
    const s = rows.find((x) => x.id === id);
    const label = s?.name ? `Delete supplier "${s.name}"?` : "Delete supplier?";
    if (!confirm(label)) return;

    setErr(null);
    setBusy(`del:${id}`);
    try {
      await apiFetch(`/inventory/suppliers/${id}`, { method: "DELETE" });
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
      <h1 style={{ margin: "12px 0" }}>Suppliers</h1>

      {err && <div style={{ color: "#ffb4b4", marginBottom: 10 }}>{err}</div>}

      {/* Add supplier */}
      <div style={{ border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Add supplier</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 240px 140px", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
          />
          <button
            onClick={createSupplier}
            disabled={busy != null}
            style={{
              border,
              borderRadius: 12,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            Create
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editingRow && (
        <div style={{ marginTop: 12, border, borderRadius: 16, background: "rgba(47,129,247,0.10)", padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Edit supplier</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 240px 120px 120px", gap: 10 }}>
            <input
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              placeholder="Supplier name"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
            />
            <input
              value={ePhone}
              onChange={(e) => setEPhone(e.target.value)}
              placeholder="Phone"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
            />
            <input
              value={eEmail}
              onChange={(e) => setEEmail(e.target.value)}
              placeholder="Email"
              style={{ padding: "10px 12px", borderRadius: 12, border, background: "transparent", color: "inherit", outline: "none" }}
            />

            <button
              onClick={saveEdit}
              disabled={busy != null}
              style={{
                border,
                borderRadius: 12,
                padding: "10px 12px",
                background: "rgba(255,255,255,0.10)",
                color: "inherit",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              Save
            </button>

            <button
              onClick={cancelEdit}
              disabled={busy != null}
              style={{
                border,
                borderRadius: 12,
                padding: "10px 12px",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Supplier list */}
      <div style={{ marginTop: 12, border, borderRadius: 16, background: cardBg, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>Supplier list</div>
          <button
            onClick={load}
            disabled={busy != null}
            style={{
              border,
              borderRadius: 12,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.04)",
              color: "inherit",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {rows.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No suppliers yet.</div>
          ) : (
            rows.map((s) => (
              <div
                key={s.id}
                style={{
                  border,
                  borderRadius: 14,
                  padding: 10,
                  background: "rgba(0,0,0,0.12)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>{s.name}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {s.phone ? `📞 ${s.phone}  ` : ""}
                    {s.email ? `✉ ${s.email}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => startEdit(s)}
                    disabled={busy != null}
                    style={{
                      border,
                      borderRadius: 12,
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteSupplier(s.id)}
                    disabled={busy != null}
                    style={{
                      border,
                      borderRadius: 12,
                      padding: "8px 10px",
                      background: "rgba(255,0,0,0.10)",
                      color: "inherit",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Delete
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
