"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [showChangePw, setShowChangePw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEmail = localStorage.getItem("login.email") || "";
    if (savedEmail) setEmail(savedEmail);

    (async () => {
      try {
        await apiFetch("/auth/me"); // cookie-based session check
        window.location.href = "/projects";
      } catch {
        setCheckingSession(false);
      }
    })();
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    try {
      const res = await apiFetch<{ access_token: string; must_change_password?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem("login.email", email);

      if (res.must_change_password) {
        setShowChangePw(true);
        setNewPassword("");
        return;
      }

      window.location.href = "/projects";
    } catch (err: any) {
      setMsg(err.message || String(err));
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      await apiFetch("/auth/change_password", {
        method: "POST",
        body: JSON.stringify({
          current_password: password,
          new_password: newPassword,
        }),
      });

      // Update local password state so next auth uses the new password
      setPassword(newPassword);

      setShowChangePw(false);
      window.location.href = "/projects";
    } catch (err: any) {
      setMsg(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Login</h1>

      <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #30363d",
              background: "#0f1623",
              color: "#e6edf3",
            }}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #30363d",
              background: "#0f1623",
              color: "#e6edf3",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={busy || checkingSession}
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid #30363d",
            background: "#1f6feb",
            color: "white",
            fontWeight: 700,
            opacity: busy || checkingSession ? 0.7 : 1,
            cursor: busy || checkingSession ? "not-allowed" : "pointer",
          }}
        >
          {checkingSession ? "Checking session..." : "Login"}
        </button>

        {msg && <div style={{ color: "#ff7b72" }}>{msg}</div>}
      </form>

      {showChangePw && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              border: "1px solid #30363d",
              borderRadius: 16,
              background: "#0f1623",
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Set a new password</div>
            <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
              This account is using a temporary password. You must set a new password to continue.
            </div>

            <form onSubmit={onChangePassword} style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #30363d",
                    background: "#0b0f17",
                    color: "#e6edf3",
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={busy || newPassword.trim().length < 8}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: "#1f6feb",
                  color: "white",
                  fontWeight: 700,
                  opacity: busy || newPassword.trim().length < 8 ? 0.65 : 1,
                  cursor: busy || newPassword.trim().length < 8 ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Saving..." : "Save new password"}
              </button>

              {msg && <div style={{ color: "#ff7b72" }}>{msg}</div>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
