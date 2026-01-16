"use client";
import React, { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("admin123");
  const [msg, setMsg] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", res.access_token);
      window.location.href = "/projects";
    } catch (err: any) {
      setMsg(err.message || String(err));
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Login</h1>
      <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)}
                 style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }} />
        </label>
        <button type="submit" style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "white", fontWeight: 700 }}>
          Login
        </button>
        {msg && <div style={{ color: "#ff7b72" }}>{msg}</div>}
      </form>
    </div>
  );
}
