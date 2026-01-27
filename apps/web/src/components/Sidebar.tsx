"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { IconBoxes, IconCog, IconFinance, IconHome, IconProjects, IconReports, IconHR } from "./icons";

type Item = {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname() || "/";

  const [role, setRole] = React.useState<string>("");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const me = await apiFetch<{ role: string }>("/auth/me");
        if (!alive) return;
        setRole(String(me?.role || "").toLowerCase());
      } catch {
        if (!alive) return;
        setRole("");
      } finally {
        if (!alive) return;
        setLoaded(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const isAdmin = loaded && role === "admin";
  const isDesigner = loaded && role === "designer";
  const isSupervisor = loaded && role === "site_supervisor";
  const isHR = loaded && role === "hr";

  const canInventory = isAdmin || isDesigner;
  const canHR = isAdmin || isHR;
  const canReports = !isSupervisor; // supervisor sees projects only
  const canSettings = isAdmin || isHR;

  const items: Item[] = isSupervisor
    ? [{ key: "projects", href: "/projects", label: "Projects", icon: <IconProjects /> }]
    : [
        { key: "dashboard", href: "/", label: "Dashboard", icon: <IconHome /> },
        { key: "projects", href: "/projects", label: "Projects", icon: <IconProjects /> },

        ...(canInventory ? [{ key: "inventory", href: "/inventory", label: "Inventory", icon: <IconBoxes /> }] : []),

        ...(isAdmin ? [{ key: "finance", href: "/finance", label: "Finance", icon: <IconFinance />, comingSoon: true }] : []),

        ...(canHR ? [{ key: "hr", href: "/hr", label: "HR", icon: <IconHR /> }] : []),

        ...(canReports ? [{ key: "reports", href: "/reports", label: "Reports", icon: <IconReports /> }] : []),
      ];

  const bottom: Item[] = canSettings
    ? [{ key: "settings", href: "/settings", label: "Settings", icon: <IconCog /> }]
    : [];

  const baseBg = "#0f1623";
  const border = "1px solid #30363d";

  function NavBtn(it: Item, place: "top" | "bottom") {
    const active = isActive(pathname, it.href);

    const common: React.CSSProperties = {
      width: 52,
      height: 46,
      borderRadius: 14,
      display: "grid",
      placeItems: "center",
      border: active ? "1px solid #2f81f7" : border,
      background: active ? "rgba(47,129,247,0.12)" : "transparent",
      color: active ? "#a5d6ff" : "#c9d1d9",
      textDecoration: "none",
      position: "relative",
      userSelect: "none",
      cursor: it.comingSoon ? "not-allowed" : "pointer",
      opacity: it.comingSoon ? 0.55 : 1,
    };

    const badge: React.CSSProperties = {
      position: "absolute",
      right: 6,
      top: 6,
      fontSize: 9,
      fontWeight: 800,
      padding: "2px 6px",
      borderRadius: 999,
      border,
      background: "rgba(255,255,255,0.06)",
      color: "#e6edf3",
    };

    const title = it.comingSoon ? `${it.label} (coming soon)` : it.label;

    if (it.comingSoon) {
      return (
        <div key={`${place}-${it.key}`} title={title} style={common}>
          {it.icon}
          <div style={badge}>SOON</div>
        </div>
      );
    }

    return (
      <Link key={`${place}-${it.key}`} href={it.href} title={title} style={common}>
        {it.icon}
      </Link>
    );
  }

  return (
    <aside
      style={{
        width: 72,
        minWidth: 72,
        background: baseBg,
        borderRight: border,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 900, letterSpacing: 0.3, padding: "8px 6px 6px", opacity: 0.95 }} title="Minifix Woodworks">
        Ad.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
        {items.map((it) => NavBtn(it, "top"))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bottom.map((it) => NavBtn(it, "bottom"))}
      </div>

      <div style={{ height: 10 }} />
    </aside>
  );
}
