import React from "react";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Workshop", description: "Workshop cloud app" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, Arial",
          margin: 0,
          background: "#0b0f17",
          color: "#e6edf3",
        }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
