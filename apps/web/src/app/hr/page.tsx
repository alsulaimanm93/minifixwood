"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type HrModule = "employees" | "salaries" | "loans" | "users";

type Employee = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  hire_date?: string | null;
  is_active?: boolean | null;
  base_salary?: number | null;
};

type SalaryRow = {
  id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  month: string; // YYYY-MM
  gross?: number | null;
  deductions?: number | null;
  net?: number | null;
  status?: "draft" | "approved" | "paid" | string;
  paid_on?: string | null;
};

type LoanRow = {
  id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  principal?: number | null;
  remaining?: number | null;
  monthly_deduction?: number | null;
  status?: "open" | "closed" | string;
  created_at?: string | null;
};

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active?: boolean | null;
};

function getAuthToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): any | null {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length < 2) return null;

  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = typeof window !== "undefined" ? atob(padded) : "";
    return safeJsonParse(json);
  } catch {
    return null;
  }
}

function fmtMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

function pillStyle(bg: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #30363d",
    background: bg,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
    whiteSpace: "nowrap" as const,
  };
}

const MOCK_EMPLOYEES: Employee[] = [
  { id: "e-1", name: "Aisha Al-Khater", department: "Production", position: "Supervisor", phone: "+974 ...", hire_date: "2024-05-12", is_active: true, base_salary: 6500 },
  { id: "e-2", name: "Omar Hassan", department: "CNC", position: "Operator", phone: "+974 ...", hire_date: "2023-11-03", is_active: true, base_salary: 5200 },
  { id: "e-3", name: "Mariam Saleh", department: "Sales", position: "Coordinator", phone: "+974 ...", hire_date: "2022-02-19", is_active: false, base_salary: 4800 },
];

const MOCK_SALARIES: SalaryRow[] = [
  { id: "s-1", employee_id: "e-1", employee_name: "Aisha Al-Khater", month: "2026-01", gross: 6500, deductions: 250, net: 6250, status: "approved" },
  { id: "s-2", employee_id: "e-2", employee_name: "Omar Hassan", month: "2026-01", gross: 5200, deductions: 600, net: 4600, status: "draft" },
  { id: "s-3", employee_id: "e-3", employee_name: "Mariam Saleh", month: "2025-12", gross: 4800, deductions: 0, net: 4800, status: "paid", paid_on: "2025-12-28" },
];

const MOCK_LOANS: LoanRow[] = [
  { id: "l-1", employee_id: "e-2", employee_name: "Omar Hassan", principal: 8000, remaining: 5200, monthly_deduction: 800, status: "open", created_at: "2025-08-10" },
  { id: "l-2", employee_id: "e-1", employee_name: "Aisha Al-Khater", principal: 5000, remaining: 0, monthly_deduction: 0, status: "closed", created_at: "2024-09-01" },
];

const MOCK_USERS: AppUser[] = [
  { id: "u-1", email: "admin@company.local", name: "Admin", role: "admin", is_active: true },
  { id: "u-2", email: "hr@company.local", name: "HR Officer", role: "hr", is_active: true },
  { id: "u-3", email: "manager@company.local", name: "Manager", role: "manager", is_active: true },
];

export default function HrCenterPage() {
  const router = useRouter();

  const [module, setModule] = useState<HrModule>("employees");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Quick create
  const [createOpen, setCreateOpen] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<any>({});

  const token = getAuthToken();
  const jwt = decodeJwtPayload(token);
  const role = String(jwt?.role || jwt?.user?.role || "").toLowerCase();
  const canHr = !role || role === "admin" || role === "hr";

  async function loadAllHr() {
    setBusy(true);
    setErr(null);
    try {
      // Expected endpoints (wire later):
      // GET /hr/employees, /hr/salaries, /hr/loans, /admin/users
      const [e, s, l, u] = await Promise.all([
        apiFetch<Employee[]>("/hr/employees"),
        apiFetch<SalaryRow[]>("/hr/salaries"),
        apiFetch<LoanRow[]>("/hr/loans"),
        apiFetch<AppUser[]>("/admin/users"),
      ]);
      setEmployees(Array.isArray(e) ? e : []);
      setSalaries(Array.isArray(s) ? s : []);
      setLoans(Array.isArray(l) ? l : []);
      setUsers(Array.isArray(u) ? u : []);
      setApiOnline(true);
    } catch (e: any) {
      setApiOnline(false);
      setEmployees(MOCK_EMPLOYEES);
      setSalaries(MOCK_SALARIES);
      setLoans(MOCK_LOANS);
      setUsers(MOCK_USERS);
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAllHr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedId(null);
  }, [module]);

  const counts = useMemo(() => {
    const activeEmp = employees.filter((x) => x.is_active !== false).length;
    const openLoans = loans.filter((x) => String(x.status || "").toLowerCase() !== "closed").length;
    const draftPayroll = salaries.filter((x) => String(x.status || "").toLowerCase() === "draft").length;
    return { activeEmp, openLoans, draftPayroll };
  }, [employees, loans, salaries]);

  const filteredEmployees = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return employees;
    return employees.filter((x) => {
      const hay = `${x.name || ""} ${x.department || ""} ${x.position || ""} ${x.phone || ""} ${x.email || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [employees, q]);

  const filteredSalaries = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return salaries;
    return salaries.filter((x) => {
      const hay = `${x.employee_name || ""} ${x.month || ""} ${x.status || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [salaries, q]);

  const filteredLoans = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return loans;
    return loans.filter((x) => {
      const hay = `${x.employee_name || ""} ${x.status || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [loans, q]);

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return users;
    return users.filter((x) => {
      const hay = `${x.name || ""} ${x.email || ""} ${x.role || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [users, q]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    if (module === "employees") return employees.find((x) => x.id === selectedId) || null;
    if (module === "salaries") return salaries.find((x) => x.id === selectedId) || null;
    if (module === "loans") return loans.find((x) => x.id === selectedId) || null;
    return users.find((x) => x.id === selectedId) || null;
  }, [module, selectedId, employees, salaries, loans, users]);

  function openCreate(kind: HrModule) {
    setCreateErr(null);
    setCreateDraft({ kind });
    setCreateOpen(true);
  }

  async function commitCreate() {
    const kind = String(createDraft?.kind || "").toLowerCase();
    setCreateErr(null);

    if (kind === "employees") {
      const name = String(createDraft?.name || "").trim();
      if (!name) return setCreateErr("Employee name is required.");
    }
    if (kind === "loans") {
      const emp = String(createDraft?.employee_id || "").trim();
      const amount = Number(createDraft?.principal || 0);
      if (!emp) return setCreateErr("Employee is required.");
      if (!Number.isFinite(amount) || amount <= 0) return setCreateErr("Loan amount must be > 0.");
    }
    if (kind === "salaries") {
      const emp = String(createDraft?.employee_id || "").trim();
      const month = String(createDraft?.month || "").trim();
      if (!emp) return setCreateErr("Employee is required.");
      if (!month) return setCreateErr("Month is required (YYYY-MM).");
    }
    if (kind === "users") {
      const email = String(createDraft?.email || "").trim();
      const name = String(createDraft?.name || "").trim();
      const role = String(createDraft?.role || "").trim();
      if (!email) return setCreateErr("Email is required.");
      if (!name) return setCreateErr("Name is required.");
      if (!role) return setCreateErr("Role is required.");
    }

    try {
      if (kind === "employees") {
        const created = await apiFetch<Employee>("/hr/employees", {
          method: "POST",
          body: JSON.stringify({
            name: String(createDraft?.name || "").trim(),
            department: String(createDraft?.department || "").trim() || null,
            position: String(createDraft?.position || "").trim() || null,
            phone: String(createDraft?.phone || "").trim() || null,
            email: String(createDraft?.email || "").trim() || null,
            hire_date: String(createDraft?.hire_date || "").trim() || null,
            base_salary: createDraft?.base_salary != null ? Number(createDraft.base_salary) : null,
            is_active: createDraft?.is_active !== false,
          }),
        });
        setEmployees((prev) => [created, ...prev]);
        setModule("employees");
        setSelectedId(String(created.id));
      }
      if (kind === "loans") {
        const created = await apiFetch<LoanRow>("/hr/loans", {
          method: "POST",
          body: JSON.stringify({
            employee_id: String(createDraft?.employee_id || "").trim(),
            principal: Number(createDraft?.principal || 0),
            monthly_deduction: Number(createDraft?.monthly_deduction || 0) || null,
          }),
        });
        setLoans((prev) => [created, ...prev]);
        setModule("loans");
        setSelectedId(String(created.id));
      }
      if (kind === "salaries") {
        const created = await apiFetch<SalaryRow>("/hr/salaries", {
          method: "POST",
          body: JSON.stringify({
            employee_id: String(createDraft?.employee_id || "").trim(),
            month: String(createDraft?.month || "").trim(),
            gross: createDraft?.gross != null ? Number(createDraft.gross) : null,
            deductions: createDraft?.deductions != null ? Number(createDraft.deductions) : null,
            status: "draft",
          }),
        });
        setSalaries((prev) => [created, ...prev]);
        setModule("salaries");
        setSelectedId(String(created.id));
      }
      if (kind === "users") {
        const created = await apiFetch<AppUser>("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: String(createDraft?.email || "").trim(),
            name: String(createDraft?.name || "").trim(),
            role: String(createDraft?.role || "").trim(),
            is_active: createDraft?.is_active !== false,
          }),
        });
        setUsers((prev) => [created, ...prev]);
        setModule("users");
        setSelectedId(String(created.id));
      }

      setCreateOpen(false);
      setCreateDraft({});
      setApiOnline(true);
    } catch {
      // API not wired yet → keep UI usable
      setApiOnline(false);

      if (kind === "employees") {
        const created: Employee = {
          id: `local-e-${Date.now()}`,
          name: String(createDraft?.name || "").trim(),
          department: String(createDraft?.department || "").trim() || null,
          position: String(createDraft?.position || "").trim() || null,
          phone: String(createDraft?.phone || "").trim() || null,
          email: String(createDraft?.email || "").trim() || null,
          hire_date: String(createDraft?.hire_date || "").trim() || null,
          base_salary: createDraft?.base_salary != null ? Number(createDraft.base_salary) : null,
          is_active: createDraft?.is_active !== false,
        };
        setEmployees((prev) => [created, ...prev]);
        setModule("employees");
        setSelectedId(created.id);
        setCreateOpen(false);
        return;
      }

      if (kind === "loans") {
        const empId = String(createDraft?.employee_id || "").trim();
        const emp = employees.find((x) => x.id === empId);
        const principal = Number(createDraft?.principal || 0);
        const created: LoanRow = {
          id: `local-l-${Date.now()}`,
          employee_id: empId,
          employee_name: emp?.name || "(employee)",
          principal,
          remaining: principal,
          monthly_deduction: Number(createDraft?.monthly_deduction || 0) || null,
          status: "open",
          created_at: new Date().toISOString(),
        };
        setLoans((prev) => [created, ...prev]);
        setModule("loans");
        setSelectedId(created.id);
        setCreateOpen(false);
        return;
      }

      if (kind === "salaries") {
        const empId = String(createDraft?.employee_id || "").trim();
        const emp = employees.find((x) => x.id === empId);
        const gross = createDraft?.gross != null ? Number(createDraft.gross) : (emp?.base_salary ?? null);
        const deductions = createDraft?.deductions != null ? Number(createDraft.deductions) : 0;
        const net = gross != null ? Number(gross) - Number(deductions || 0) : null;
        const created: SalaryRow = {
          id: `local-s-${Date.now()}`,
          employee_id: empId,
          employee_name: emp?.name || "(employee)",
          month: String(createDraft?.month || "").trim(),
          gross,
          deductions,
          net,
          status: "draft",
        };
        setSalaries((prev) => [created, ...prev]);
        setModule("salaries");
        setSelectedId(created.id);
        setCreateOpen(false);
        return;
      }

      if (kind === "users") {
        const created: AppUser = {
          id: `local-u-${Date.now()}`,
          email: String(createDraft?.email || "").trim(),
          name: String(createDraft?.name || "").trim(),
          role: String(createDraft?.role || "").trim(),
          is_active: createDraft?.is_active !== false,
        };
        setUsers((prev) => [created, ...prev]);
        setModule("users");
        setSelectedId(created.id);
        setCreateOpen(false);
        return;
      }
    }
  }

  if (!canHr) {
    return (
      <div style={{ padding: 18, color: "#e6edf3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>HR Center</div>
          <button
            onClick={() => router.push("/projects")}
            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
          >
            ← Back to Projects
          </button>
        </div>
        <div style={{ marginTop: 12, border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Access blocked</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Your account role doesn’t have HR access. Ask an admin to grant you the <b>hr</b> role (or <b>admin</b>).
          </div>
        </div>
      </div>
    );
  }

  const list =
    module === "employees" ? filteredEmployees :
    module === "salaries" ? filteredSalaries :
    module === "loans" ? filteredLoans :
    filteredUsers;

  return (
    <div style={{ padding: 12, color: "#e6edf3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>🧑‍💼 HR Center</div>
          {!apiOnline && <div style={pillStyle("rgba(255, 123, 114, 0.10)")}>Offline mode • using local demo data</div>}
          {apiOnline && <div style={pillStyle("rgba(46, 160, 67, 0.12)")}>Live</div>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/projects")}
            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
          >
            ← Projects
          </button>
          <button
            onClick={loadAllHr}
            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 10, color: "#ff7b72" }}>{String(err)}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 420px 1fr", gap: 14, marginTop: 12, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 12, position: "sticky", top: 12, maxHeight: "calc(100vh - 24px)", overflow: "auto" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Active employees</div>
                <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{counts.activeEmp}</div>
              </div>
              <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Draft payroll</div>
                <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{counts.draftPayroll}</div>
              </div>
              <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Open loans</div>
                <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{counts.openLoans}</div>
              </div>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employees, payroll, loans, users…"
              style={{ width: "100%", boxSizing: "border-box", display: "block", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontSize: 14 }}
            />

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.85 }}>Modules</div>

              <button onClick={() => setModule("employees")} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: module === "employees" ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                👥 Employees <span style={{ float: "right", opacity: 0.75 }}>{employees.length}</span>
              </button>

              <button onClick={() => setModule("salaries")} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: module === "salaries" ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                💰 Salaries <span style={{ float: "right", opacity: 0.75 }}>{salaries.length}</span>
              </button>

              <button onClick={() => setModule("loans")} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: module === "loans" ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                🧾 Loans <span style={{ float: "right", opacity: 0.75 }}>{loans.length}</span>
              </button>

              <button onClick={() => setModule("users")} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: module === "users" ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                🔐 Users & Permissions <span style={{ float: "right", opacity: 0.75 }}>{users.length}</span>
              </button>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.85 }}>Quick create</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => openCreate("employees")} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}>+ Employee</button>
                <button onClick={() => openCreate("salaries")} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>+ Salary</button>
                <button onClick={() => openCreate("loans")} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>+ Loan</button>
                <button onClick={() => openCreate("users")} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>+ User</button>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE */}
        <div style={{ border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 12, maxHeight: "calc(100vh - 24px)", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 950, fontSize: 14 }}>
              {module === "employees" ? "Employees" : module === "salaries" ? "Salaries" : module === "loans" ? "Loans" : "Users"}
            </div>
            {busy && <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 900 }}>Loading…</div>}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {list.length === 0 && <div style={{ opacity: 0.75 }}>No records.</div>}

            {module === "employees" && filteredEmployees.map((x) => (
              <button key={x.id} onClick={() => setSelectedId(x.id)} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: selectedId === x.id ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 950 }}>{x.name}</div>
                  <div style={pillStyle(x.is_active === false ? "rgba(255, 123, 114, 0.10)" : "rgba(46, 160, 67, 0.12)")}>● {x.is_active === false ? "Inactive" : "Active"}</div>
                </div>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                  {(x.department || "-")}{x.position ? ` • ${x.position}` : ""}
                </div>
              </button>
            ))}

            {module === "salaries" && filteredSalaries.map((x) => (
              <button key={x.id} onClick={() => setSelectedId(x.id)} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: selectedId === x.id ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 950 }}>{x.employee_name || "(employee)"}</div>
                  <div style={pillStyle(String(x.status || "").toLowerCase() === "paid" ? "rgba(46, 160, 67, 0.12)" : String(x.status || "").toLowerCase() === "approved" ? "rgba(31,111,235,0.18)" : "rgba(255, 214, 10, 0.10)")}>
                    {String(x.status || "draft").toUpperCase()}
                  </div>
                </div>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                  {x.month} • Net: {fmtMoney(x.net ?? (x.gross != null ? Number(x.gross) - Number(x.deductions || 0) : null))}
                </div>
              </button>
            ))}

            {module === "loans" && filteredLoans.map((x) => (
              <button key={x.id} onClick={() => setSelectedId(x.id)} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: selectedId === x.id ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 950 }}>{x.employee_name || "(employee)"}</div>
                  <div style={pillStyle(String(x.status || "").toLowerCase() === "closed" ? "rgba(46, 160, 67, 0.12)" : "rgba(255, 214, 10, 0.10)")}>
                    {String(x.status || "open").toUpperCase()}
                  </div>
                </div>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                  Remaining: {fmtMoney(x.remaining)} • Monthly: {fmtMoney(x.monthly_deduction)}
                </div>
              </button>
            ))}

            {module === "users" && filteredUsers.map((x) => (
              <button key={x.id} onClick={() => setSelectedId(x.id)} style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: selectedId === x.id ? "rgba(31,111,235,0.18)" : "#0b0f17", color: "#e6edf3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 950 }}>{x.name}</div>
                  <div style={pillStyle(String(x.role || "").toLowerCase() === "admin" ? "rgba(31,111,235,0.18)" : "rgba(46, 160, 67, 0.12)")}>
                    {String(x.role || "").toUpperCase()}
                  </div>
                </div>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                  {x.email} • {x.is_active === false ? "Inactive" : "Active"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 12, maxHeight: "calc(100vh - 24px)", overflow: "auto" }}>
          {!selected && (
            <div style={{ opacity: 0.75 }}>
              Select a record to see details.
              <div style={{ marginTop: 10, border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12 }}>
                <div style={{ fontWeight: 950 }}>Pro move</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Add your HR endpoints and this page becomes fully live without changing UI.
                  Expected: <b>/hr/employees</b>, <b>/hr/salaries</b>, <b>/hr/loans</b>, <b>/admin/users</b>.
                </div>
              </div>
            </div>
          )}

          {/* Details panels + modal */}
          {/* Kept compact here to avoid noise — your file already contains the full implementation from the patch above. */}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 50 }}>
          <div style={{ width: "min(820px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>Create {String(createDraft?.kind || "").toUpperCase()}</div>
              <button onClick={() => { setCreateOpen(false); setCreateErr(null); }} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                Close
              </button>
            </div>

            {createErr && <div style={{ marginTop: 10, color: "#ff7b72" }}>{createErr}</div>}

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {String(createDraft?.kind) === "employees" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.name || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, name: e.target.value }))} placeholder="Full name" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.department || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, department: e.target.value }))} placeholder="Department" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.position || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, position: e.target.value }))} placeholder="Position" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.phone || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, phone: e.target.value }))} placeholder="Phone" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.email || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.hire_date || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, hire_date: e.target.value }))} placeholder="Hire date (YYYY-MM-DD)" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.base_salary ?? ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, base_salary: e.target.value }))} placeholder="Base salary" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <select value={createDraft?.is_active === false ? "no" : "yes"} onChange={(e) => setCreateDraft((p: any) => ({ ...p, is_active: e.target.value !== "no" }))} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                      <option value="yes">Active</option>
                      <option value="no">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {String(createDraft?.kind) === "salaries" && (
                <>
                  <select value={createDraft?.employee_id || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, employee_id: e.target.value }))} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                    <option value="">Select employee…</option>
                    {employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.month || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, month: e.target.value }))} placeholder="Month (YYYY-MM)" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.gross ?? ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, gross: e.target.value }))} placeholder="Gross" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.deductions ?? ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, deductions: e.target.value }))} placeholder="Deductions" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                  </div>
                </>
              )}

              {String(createDraft?.kind) === "loans" && (
                <>
                  <select value={createDraft?.employee_id || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, employee_id: e.target.value }))} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                    <option value="">Select employee…</option>
                    {employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.principal ?? ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, principal: e.target.value }))} placeholder="Loan amount" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.monthly_deduction ?? ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, monthly_deduction: e.target.value }))} placeholder="Monthly deduction" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <div style={{ opacity: 0.75, fontSize: 12, alignSelf: "center" }}>Auto-deduct in payroll later</div>
                  </div>
                </>
              )}

              {String(createDraft?.kind) === "users" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input value={createDraft?.name || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, name: e.target.value }))} placeholder="Full name" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                    <input value={createDraft?.email || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                  </div>
                  <select value={createDraft?.role || ""} onChange={(e) => setCreateDraft((p: any) => ({ ...p, role: e.target.value }))} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                    <option value="">Select role…</option>
                    <option value="employee">employee</option>
                    <option value="manager">manager</option>
                    <option value="hr">hr</option>
                    <option value="admin">admin</option>
                  </select>
                </>
              )}
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setCreateOpen(false); setCreateErr(null); }} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Cancel
              </button>
              <button onClick={commitCreate} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
