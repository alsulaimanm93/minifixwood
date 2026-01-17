export default function SupplierPerformanceReport() {
  return (
    <div>
      <h1 style={{ margin: "12px 0" }}>Supplier Performance</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        Coming next: lead times, price changes, and top purchased items per supplier.
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
          <li>Avg lead time (PO → received)</li>
          <li>Reliability score (on-time %)</li>
          <li>Price drift by SKU</li>
          <li>Spend breakdown</li>
        </ul>
      </div>
    </div>
  );
}
