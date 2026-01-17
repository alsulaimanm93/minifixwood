import Link from "next/link";

function Card({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        border: "1px solid #30363d",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 18,
        padding: 16,
        transition: "transform 120ms ease, background 120ms ease",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.4 }}>{desc}</div>

      <div style={{ marginTop: 14, opacity: 0.85, fontSize: 12 }}>
        Open →
      </div>
    </Link>
  );
}

export default function ReportsPage() {
  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Reports</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        Read-only dashboards. Fast insights without touching the workflow.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <Card
          title="Profit by Project"
          desc="Revenue, cost, and margin breakdown by project + quick winners/losers."
          href="/reports/profit-by-project"
        />
        <Card
          title="Waste %"
          desc="Waste by material, sheet size, and nesting runs. Track improvement over time."
          href="/reports/waste"
        />
        <Card
          title="Supplier Performance"
          desc="Lead time, price drift, reliability, and what you buy the most from each supplier."
          href="/reports/suppliers"
        />
        <Card
          title="Project Pipeline"
          desc="How many projects in each status, aging, and bottlenecks."
          href="/reports/pipeline"
        />
      </div>
    </div>
  );
}
