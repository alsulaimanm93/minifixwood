export default function WasteReport() {
  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Waste %</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        Coming next: waste by material + sheet size + nesting run, plus trend over time.
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
          <li>Used area vs sheet area</li>
          <li>Remnant area saved</li>
          <li>Scrap area (below remnant threshold)</li>
          <li>Waste% per material and per thickness</li>
        </ul>
      </div>
    </div>
  );
}
