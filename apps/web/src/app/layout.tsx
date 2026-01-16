import React from "react";

export const metadata = { title: "Workshop", description: "Workshop cloud app" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, Arial", margin: 0, background: "#0b0f17", color: "#e6edf3" }}>
        <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: 12 }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 800 }}>Workshop</div>
            <nav style={{ display: "flex", gap: 12 }}>
              <a href="/projects" style={{ color: "#e6edf3" }}>Projects</a>
              <a href="/projects/new" style={{ color: "#e6edf3", fontWeight: 800 }}>+ New Project</a>
              <a href="/login" style={{ color: "#e6edf3" }}>Login</a>
            </nav>
          </header>
          <main style={{ marginTop: 16 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
