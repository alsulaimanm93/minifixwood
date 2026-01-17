export default function ProfitByProjectReport() {
  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Profit by Project</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        Coming next: table + filters (date range, status, customer) and margin summary.
      </p>

      <div
        style={{
          marginTop: 16,
          border: "1px solid #30363d",
          borderRadius: 18,
          padding: 16,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Planned metrics</div>
        <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.85, lineHeight: 1.6 }}>
          <li>Total invoiced / received</li>
          <li>Material cost (from BOM + purchases)</li>
          <li>Labor estimate (later)</li>
          <li>Net profit + margin%</li>
        </ul>
      </div>
    </div>
  );
}
