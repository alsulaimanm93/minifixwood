"use client";

import React from "react";
import { apiFetch } from "@/lib/api";

type UserOut = {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  employee_id?: string | null;
  must_change_password?: boolean;
};

type UserCreateResult = UserOut & { temp_password?: string | null };

const ROLE_OPTIONS = [
  { key: "admin", label: "Admin" },
  { key: "designer", label: "Designer" },
  { key: "site_supervisor", label: "Site Supervisor" },
  { key: "hr", label: "HR" },
];

export default function SettingsPage() {
  const [role, setRole] = React.useState<string>("");
  const [loadingMe, setLoadingMe] = React.useState(true);

  const [users, setUsers] = React.useState<UserOut[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [draft, setDraft] = React.useState<Record<string, Partial<UserOut>>>({});
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);

  const [newEmail, setNewEmail] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newRole, setNewRole] = React.useState("site_supervisor");
  const [creating, setCreating] = React.useState(false);

  const canManage = role === "admin" || role === "hr";

  async function loadUsers() {
    setLoadingUsers(true);
    setErr(null);
    try {
      const data = await apiFetch<UserOut[]>("/admin/users");
      setUsers(data);
      setDraft({});
    } catch (e: any) {
      setErr(e?.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  React.useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ role: string }>("/auth/me");
        setRole(String(me?.role || "").toLowerCase());
      } catch {
        setRole("");
      } finally {
        setLoadingMe(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!loadingMe && canManage) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMe, canManage]);

  function setDraftField(id: string, patch: Partial<UserOut>) {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
  }

  async function saveUser(id: string) {
    setErr(null);
    setTempPassword(null);
    try {
      const p = draft[id] || {};
      const payload: any = {};
      if (p.role != null) payload.role = p.role;
      if (p.is_active != null) payload.is_active = p.is_active;

      const updated = await apiFetch<UserOut>(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setUsers((u) => u.map((x) => (x.id === id ? updated : x)));
      setDraft((d) => {
        const nd = { ...d };
        delete nd[id];
        return nd;
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to save user");
    }
  }

  async function resetPassword(id: string) {
    setErr(null);
    setTempPassword(null);
    try {
      const res = await apiFetch<UserCreateResult>(`/admin/users/${id}/reset_password`, {
        method: "POST",
      });
      setTempPassword(res?.temp_password || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to reset password");
    }
  }

  async function createUserSimple() {
    setErr(null);
    setTempPassword(null);

    const email = newEmail.trim().toLowerCase();
    const name = newName.trim();
    if (!email || !name) {
      setErr("Email + Name are required");
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch<UserCreateResult>("/admin/users/simple", {
        method: "POST",
        body: JSON.stringify({ email, name, role: newRole, is_active: true }),
      });

      setTempPassword(res?.temp_password || null);
      setNewEmail("");
      setNewName("");
      setNewRole("site_supervisor");

      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ margin: "12px 0" }}>Settings</h1>

      {!loadingMe && !canManage && (
        <div style={{ opacity: 0.85 }}>
          You don’t have access to user management.
        </div>
      )}

      {canManage && (
        <>
          <h2 style={{ margin: "10px 0" }}>Users & Roles</h2>

          {err && (
            <div style={{ padding: 10, border: "1px solid #803", borderRadius: 10 }}>
              {err}
            </div>
          )}

          {tempPassword && (
            <div style={{ padding: 10, border: "1px solid #2f81f7", borderRadius: 10 }}>
              Temp password: <b>{tempPassword}</b>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                User will be forced to change it on next login.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #30363d", minWidth: 260 }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #30363d", minWidth: 220 }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Role</div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #30363d" }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={createUserSimple}
              disabled={creating}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "#1f6feb",
                color: "white",
                fontWeight: 800,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
              }}
            >
              Create User
            </button>

            <button
              onClick={loadUsers}
              disabled={loadingUsers}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #30363d",
                background: "transparent",
                color: "#c9d1d9",
                fontWeight: 800,
                cursor: loadingUsers ? "not-allowed" : "pointer",
                opacity: loadingUsers ? 0.7 : 1,
              }}
            >
              Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #30363d" }}>
                  <th style={{ padding: "10px 8px" }}>Name</th>
                  <th style={{ padding: "10px 8px" }}>Email</th>
                  <th style={{ padding: "10px 8px" }}>Role</th>
                  <th style={{ padding: "10px 8px" }}>Active</th>
                  <th style={{ padding: "10px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const d = draft[u.id] || {};
                  const curRole = String((d.role ?? u.role) || "").toLowerCase();
                  const curActive = (d.is_active ?? u.is_active) as boolean;
                  const dirty = draft[u.id] != null;

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #20252b" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 700 }}>{u.name}</td>
                      <td style={{ padding: "10px 8px", opacity: 0.9 }}>{u.email}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <select
                          value={curRole}
                          onChange={(e) => setDraftField(u.id, { role: e.target.value })}
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #30363d" }}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <input
                          type="checkbox"
                          checked={!!curActive}
                          onChange={(e) => setDraftField(u.id, { is_active: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: "10px 8px", display: "flex", gap: 8 }}>
                        <button
                          onClick={() => saveUser(u.id)}
                          disabled={!dirty}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #30363d",
                            background: dirty ? "#1f6feb" : "transparent",
                            color: dirty ? "white" : "#c9d1d9",
                            fontWeight: 800,
                            cursor: dirty ? "pointer" : "not-allowed",
                            opacity: dirty ? 1 : 0.6,
                          }}
                        >
                          Save
                        </button>

                        <button
                          onClick={() => resetPassword(u.id)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #30363d",
                            background: "transparent",
                            color: "#c9d1d9",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Reset PW
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
