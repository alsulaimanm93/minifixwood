"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  created_at: string;
  updated_at: string;
  eta_date?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
};

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

function daysSince(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function PipelineReport() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const [stuckDays, setStuckDays] = useState<number>(14);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const rows = await apiFetch<Project[]>("/projects/all");
        if (!alive) return;
        setProjects(rows || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load projects.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

    const enriched = useMemo(() => {
    return projects.map((p) => ({
        ...p,
        ageDays: daysSince(p.created_at),
        inactiveDays: daysSince(p.updated_at),
    }));
    }, [projects]);

  const filtered = useMemo(() => {
    const base = statusFilter === "all" ? enriched : enriched.filter((p) => p.status === statusFilter);
    return base.sort((a, b) => b.inactiveDays - a.inactiveDays);
  }, [enriched, statusFilter]);

  const byStatus = useMemo(() => {
    const map = new Map<Status, { count: number; ages: number[] }>();
    for (const s of STATUS_ORDER) map.set(s, { count: 0, ages: [] });

    for (const p of enriched) {
      const entry = map.get(p.status);
      if (!entry) continue;
      entry.count += 1;
      entry.ages.push(p.inactiveDays);
    }
    return map;
  }, [enriched]);

  const stuck = useMemo(() => {
    return filtered.filter((p) => p.ageDays >= stuckDays);
  }, [filtered, stuckDays]);

  const border = "1px solid #30363d";
  const cardBg = "rgba(255,255,255,0.03)";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: "12px 0 6px" }}>Project Pipeline</h1>
          <p style={{ opacity: 0.85, margin: 0 }}>
            Counts by status + aging. Uses <span style={{ fontWeight: 800 }}>updated_at</span> as “last activity”.
          </p>
        </div>

        <Link
          href="/reports"
          style={{
            textDecoration: "none",
            color: "inherit",
            border,
            borderRadius: 14,
            padding: "10px 12px",
            background: cardBg,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          ← Reports
        </Link>
      </div>

      {/* Controls */}
      <div
        style={{
          marginTop: 16,
          border,
          borderRadius: 18,
          padding: 12,
          background: cardBg,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>Status:</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              background: "transparent",
              color: "inherit",
              border,
              borderRadius: 12,
              padding: "8px 10px",
              outline: "none",
            }}
          >
            <option value="all">All</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_TITLES[s]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>Stuck after (days):</div>
          <input
            type="number"
            min={1}
            value={stuckDays}
            onChange={(e) => setStuckDays(Math.max(1, Number(e.target.value || 1)))}
            style={{
              width: 90,
              background: "transparent",
              color: "inherit",
              border,
              borderRadius: 12,
              padding: "8px 10px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginLeft: "auto", opacity: 0.85, fontSize: 13 }}>
          Total: <span style={{ fontWeight: 900 }}>{filtered.length}</span> • Stuck:{" "}
          <span style={{ fontWeight: 900 }}>{stuck.length}</span>
        </div>
      </div>

      {/* Status cards */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {STATUS_ORDER.map((s) => {
          const entry = byStatus.get(s)!;
          const avgAge = Math.round(avg(entry.ages));
          const active = statusFilter === "all" ? false : statusFilter === s;

          return (
            <button
              key={s}
              onClick={() => setStatusFilter((prev) => (prev === s ? "all" : s))}
              style={{
                textAlign: "left",
                border: active ? "1px solid #2f81f7" : border,
                background: active ? "rgba(47,129,247,0.12)" : cardBg,
                borderRadius: 18,
                padding: 14,
                color: "inherit",
                cursor: "pointer",
              }}
              title="Click to filter"
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{STATUS_TITLES[s]}</div>

              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{entry.count}</div>
                <div style={{ opacity: 0.85, fontSize: 13 }}>
                  avg age: <span style={{ fontWeight: 900 }}>{avgAge}</span>d
                </div>
              </div>

              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                {active ? "Filtered (click to clear)" : "Click to filter"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ opacity: 0.85 }}>Loading…</div>
        ) : err ? (
          <div style={{ border, borderRadius: 18, padding: 14, background: cardBg }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Error</div>
            <div style={{ opacity: 0.85 }}>{err}</div>
            <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12 }}>
              Tip: make sure you’re logged in (token in localStorage) and the API is running.
            </div>
          </div>
        ) : (
          <>
            {/* Stuck list */}
            <div style={{ border, borderRadius: 18, padding: 14, background: cardBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Stuck projects (≥ {stuckDays} days)</div>
                <Link href="/projects" style={{ color: "inherit", opacity: 0.9, fontWeight: 800, textDecoration: "none" }}>
                  Open Projects →
                </Link>
              </div>

              {stuck.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.8 }}>No stuck projects. Nice.</div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {stuck.slice(0, 20).map((p) => (
                    <div
                      key={p.id}
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
                        <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.project_no ? `#${p.project_no} — ` : ""}
                          {p.name}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
                          {STATUS_TITLES[p.status]} • inactive: <span style={{ fontWeight: 900 }}>{p.inactiveDays}d</span> • age:{" "}
                          <span style={{ fontWeight: 900 }}>{p.ageDays}d</span>
                        </div>
                      </div>

                      <div style={{ opacity: 0.85, fontSize: 12, whiteSpace: "nowrap" }}>
                        Priority: <span style={{ fontWeight: 900 }}>{p.priority}</span>
                      </div>
                    </div>
                  ))}

                  {stuck.length > 20 && (
                    <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>
                      Showing 20 of {stuck.length}. (We can add paging/search next.)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Aging table */}
            <div style={{ marginTop: 12, border, borderRadius: 18, padding: 14, background: cardBg }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                Aging (sorted by last activity)
              </div>

              {filtered.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No projects.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {filtered.slice(0, 30).map((p) => (
                    <div
                      key={p.id}
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
                        <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.project_no ? `#${p.project_no} — ` : ""}
                          {p.name}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
                        {STATUS_TITLES[p.status]} • age {p.ageDays}d
                        </div>
                      </div>

                      <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
                        {p.inactiveDays}d
                      </div>
                    </div>
                  ))}

                  {filtered.length > 30 && (
                    <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>
                      Showing 30 of {filtered.length}. (We can add paging/search next.)
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
