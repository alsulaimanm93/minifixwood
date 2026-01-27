import React from "react";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Workshop", description: "Workshop cloud app" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ overflowX: "hidden", maxWidth: "100%" }}>
      <body
        style={{
          fontFamily: "system-ui, Arial",
          margin: 0,
          background: "#0b0f17",
          color: "#e6edf3",

          // global hard-stop for horizontal scrolling
          overflowX: "hidden",
          maxWidth: "100%",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );

}
