export const API_BASE = "/api";

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers || {});
  if (opts.body != null && !headers.get("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, credentials: "include" });

  if (res.status === 401) {
    try {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    } catch {}
  }

  if (!res.ok) {
    let detail: any = null;
    try { detail = await res.json(); } catch {}
    throw new Error(detail?.detail?.message || detail?.detail || `${res.status} ${res.statusText}`);
  }

  return res.json();
}
