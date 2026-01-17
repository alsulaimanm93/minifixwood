import Link from "next/link";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const border = "1px solid #30363d";
  const cardBg = "rgba(255,255,255,0.03)";

  const nav = [
    { href: "/inventory/items", label: "Items (Catalog)" },
    { href: "/inventory/stock", label: "Stock (Lots)" },
    { href: "/inventory/sheets", label: "Sheets & Remnants" },
    { href: "/inventory/suppliers", label: "Suppliers" },
    { href: "/inventory/planning", label: "Purchase Planning" },
  ];

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <aside
        style={{
          width: 260,
          minWidth: 260,
          border,
          borderRadius: 16,
          background: cardBg,
          padding: 10,
          height: "calc(100vh - 110px)",
          position: "sticky",
          top: 86,
        }}
      >
        <div style={{ fontWeight: 900, margin: "6px 8px 10px" }}>Inventory</div>

        <div style={{ display: "grid", gap: 8 }}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                textDecoration: "none",
                color: "inherit",
                border,
                borderRadius: 12,
                padding: "10px 10px",
                background: "rgba(0,0,0,0.12)",
                fontWeight: 800,
                opacity: 0.95,
              }}
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12, padding: "0 8px" }}>
          Requirements are set inside each project. Inventory is for catalog/stock/receiving and planning.
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
