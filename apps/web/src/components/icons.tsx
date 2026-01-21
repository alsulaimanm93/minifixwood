import React from "react";

type Props = { size?: number; stroke?: string; className?: string };

function S({ size = 22, stroke = "currentColor" }: Props) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as any;
}

export function IconHome(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}
export function IconHR() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19 8v4M17 10h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconProjects(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
      <path d="M7 16h10" />
    </svg>
  );
}

export function IconBoxes(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <path d="M21 8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 7.3 12 12l8.7-4.7" />
      <path d="M12 22V12" />
    </svg>
  );
}

export function IconFinance(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function IconReports(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17v-6" />
      <path d="M12 17V7" />
      <path d="M16 17v-3" />
    </svg>
  );
}

export function IconCog(p: Props) {
  const a = S(p);
  return (
    <svg {...a}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a7.7 7.7 0 0 0-1.7-1l-.4-2.5H9l-.4 2.5a7.7 7.7 0 0 0-1.7 1L4.5 8 2.5 11.5l2 1.5a7.8 7.8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-.5a7.7 7.7 0 0 0 1.7 1l.4 2.5h6l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4.5 2-3.5Z" />
    </svg>
  );
}
