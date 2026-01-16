"use client";

import React, { useState } from "react";
import { apiFetch } from "@/lib/api";

type Status =
  | "under_preparation"
  | "prepared_for_quotation"
  | "pending_confirmation"
  | "current"
  | "finished"
  | "rejected";

const STATUS_TITLES: Record<Status, string> = {
  under_preparation: "Under Preparation",
  prepared_for_quotation: "Prepared for Quotation",
  pending_confirmation: "Pending Confirmation",
  current: "Current",
  finished: "Finished",
  rejected: "Rejected",
};

export default function NewProjectPage() {
  const [name, setName] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [status, setStatus] = useState<Status>("under_preparation");
  const [priority, setPriority] = useState("0");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Project name is required.");
      return;
    }

    const pn = projectNo.trim() ? Number(projectNo.trim()) : null;
    if (projectNo.trim() && Number.isNaN(pn)) {
      setErr("Project No must be a number.");
      return;
    }

    const pr = Number(priority.trim() || "0");
    if (Number.isNaN(pr)) {
      setErr("Priority must be a number.");
      return;
    }

    setBusy(true);
    try {
      await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          project_no: pn,
          name: trimmed,
          status,
          priority: pr,
        }),
      });

      window.location.href = "/projects";
    } catch (e2: any) {
      setErr(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h1 style={{ margin: "12px 0" }}>New Project</h1>

      <form onSubmit={onCreate} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Villa Kitchen - Al Wakra"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #2f3338", background: "#0b0f14", color: "#e6edf3" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Project No (optional)</div>
          <input
            value={projectNo}
            onChange={(e) => setProjectNo(e.target.value)}
            placeholder="e.g. 2412"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #2f3338", background: "#0b0f14", color: "#e6edf3" }}
          />
        </label>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #2f3338", background: "#0b0f14", color: "#e6edf3" }}
          >
            {(Object.keys(STATUS_TITLES) as Status[]).map((k) => (
              <option key={k} value={k}>{STATUS_TITLES[k]}</option>
            ))}
          </select>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Priority</div>
          <input
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="0"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #2f3338", background: "#0b0f14", color: "#e6edf3" }}
          />
        </label>

        {err ? <div style={{ color: "#ff7b72" }}>{err}</div> : null}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #2f3338",
              background: busy ? "#111827" : "#0f172a",
              color: "#e6edf3",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {busy ? "Creating..." : "Create"}
          </button>

          <a href="/projects" style={{ alignSelf: "center", color: "#9aa4af" }}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
