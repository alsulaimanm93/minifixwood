"use client";
import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Project = { id: string; project_no?: number | null; name: string; status: string; priority: number; updated_at: string };

export default function CurrentProjectsPage() {
  const [items, setItems] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function load() {
    setErr(null);
    try {
      const res = await apiFetch<Project[]>("/projects?status=current");
      setItems(res);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function addProject() {
    if (!name.trim()) return;
    setErr(null);
    try {
      await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name: name.trim(), status: "current", priority: 0 }) });
      setName("");
      await load();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Current Projects</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "10px 0 16px" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name..."
               style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }} />
        <button onClick={addProject} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#2ea043", color: "white", fontWeight: 800 }}>
          Add
        </button>
        <button onClick={load} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}>
          Refresh
        </button>
      </div>

      {err && <div style={{ color: "#ff7b72", marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {items.map(p => (
          <div key={p.id} style={{ border: "1px solid #30363d", borderRadius: 16, padding: 12, background: "#0f1623" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>{p.name}</div>
              <div style={{ opacity: 0.75, fontSize: 12 }}>{new Date(p.updated_at).toLocaleString()}</div>
            </div>
            <div style={{ opacity: 0.85, marginTop: 6, fontSize: 13 }}>
              Status: <b>{p.status}</b> • Priority: <b>{p.priority}</b>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={`/project/${p.id}`} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", color: "#e6edf3", textDecoration: "none" }}>
                Open
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
