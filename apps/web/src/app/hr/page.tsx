"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Employee = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  hire_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  base_salary?: number | null;
  default_bonus?: number | null;
};

type SalaryRow = {
  id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  month: string;

  gross?: number | null;
  deductions?: number | null;
  net?: number | null;
  status?: string;
  paid_on?: string | null;

  bonuses?: number | null;
  overtime_hours?: number | null;
  hourly_rate?: number | null;
  overtime_pay?: number | null;

  manual_deductions?: number | null;
  already_paid?: number | null;

  loan_deduction?: number | null;
  loan_override?: number | null;
};

type LoanRow = {
  id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  principal?: number | null;
  remaining?: number | null;
  monthly_deduction?: number | null;
  status?: string;
  created_at?: string | null;
};

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active?: boolean | null;
  employee_id?: string | null;
  must_change_password?: boolean | null;
  temp_password?: string | null;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  day: string; // YYYY-MM-DD
  status: string; // present | absent | leave | sick
  deduct: boolean;
  note?: string | null;
};

type PaymentRow = {
  id: string;
  employee_id: string;
  month: string; // YYYY-MM
  amount: number;
  paid_on: string; // YYYY-MM-DD
  note?: string | null;
};

type SalaryCenterTab = "payroll" | "bonus" | "deductions" | "payments" | "loans";

type MoneyEntry = {
  id: string;
  amount: string;
  reason: string;
};

const USER_ROLE_OPTIONS = [
  { key: "site_supervisor", label: "Site Supervisor" },
  { key: "designer", label: "Designer" },
  { key: "employee", label: "Employee" },
  { key: "worker", label: "Worker" },
  { key: "viewer", label: "Viewer" },
  { key: "manager", label: "Manager" },
  { key: "hr", label: "HR" },
  { key: "admin", label: "Admin" },
] as const;

function getAuthToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || localStorage.getItem("access_token") || localStorage.getItem("jwt") || "";
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
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function pill(bg: string) {
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
    whiteSpace: "nowrap" as const,
  };
}

function currentMonthYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function _ymAdd(ym: string, deltaMonths: number) {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  const d = new Date(Date.UTC(y, (m - 1) + deltaMonths, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function buildMonthOptions(centerYM: string, backMonths = 24, forwardMonths = 2) {
  const out: string[] = [];
  for (let i = -backMonths; i <= forwardMonths; i++) out.push(_ymAdd(centerYM, i));
  // newest first feels better in dropdown
  return out.reverse();
}

function MonthYearPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const parseYear = (ym: string) => {
    const y = Number(String(ym).slice(0, 4));
    return Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : new Date().getFullYear();
  };

  const [year, setYear] = useState<number>(parseYear(value));

  const months = [
    { mm: "01", label: "Jan" },
    { mm: "02", label: "Feb" },
    { mm: "03", label: "Mar" },
    { mm: "04", label: "Apr" },
    { mm: "05", label: "May" },
    { mm: "06", label: "Jun" },
    { mm: "07", label: "Jul" },
    { mm: "08", label: "Aug" },
    { mm: "09", label: "Sep" },
    { mm: "10", label: "Oct" },
    { mm: "11", label: "Nov" },
    { mm: "12", label: "Dec" },
  ];

    return (
      <div
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          minWidth: 0,
        }}
      >
      <button
        onClick={() => {
          setYear(parseYear(value));
          setOpen((v) => !v);
        }}
        style={{
          padding: "8px 34px 8px 10px",
          borderRadius: 12,
          border: "1px solid #30363d",
          background: "#0b0f17",
          color: "#e6edf3",
          width: 140,
          fontWeight: 900,
          cursor: "pointer",
          textAlign: "left",
        }}
        title="Pick month"
      >
        {value || "YYYY-MM"}
        <span style={{ float: "right", opacity: 0.9 }}>▾</span>
      </button>

      {open && (
        <>
          {/* click-outside overlay */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />

          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              zIndex: 50,
              width: 280,
              maxWidth: "90vw",
              border: "1px solid #30363d",
              borderRadius: 14,
              background: "#0f1623",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              padding: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => setYear((y) => y - 1)}
                style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 950, cursor: "pointer" }}
                aria-label="Previous year"
              >
                ←
              </button>

              <div style={{ fontWeight: 950, opacity: 0.95 }}>{year}</div>

              <button
                onClick={() => setYear((y) => y + 1)}
                style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 950, cursor: "pointer" }}
                aria-label="Next year"
              >
                →
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {months.map((m) => {
                const ym = `${year}-${m.mm}`;
                const active = ym === value;
                return (
                  <button
                    key={ym}
                    onClick={() => {
                      onChange(ym);
                      setOpen(false);
                    }}
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: active ? "1px solid #1f6feb" : "1px solid #30363d",
                      background: active ? "#1f6feb" : "#0b0f17",
                      color: "#e6edf3",
                      fontWeight: 950,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    title={ym}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function normEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

const LABEL_STYLE: React.CSSProperties = { fontSize: 12, opacity: 0.75, fontWeight: 900 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={LABEL_STYLE}>{label}</div>
      {children}
    </div>
  );
}


export default function HrPayrollPage() {
  const router = useRouter();

  const token = getAuthToken();
  const jwt = decodeJwtPayload(token);
  const role = String(jwt?.role || jwt?.user?.role || "").toLowerCase();
  const canHr = !role || role === "admin" || role === "hr";

  const [month, setMonth] = useState<string>(currentMonthYYYYMM());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Mobile layout switch
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const on = () => setIsMobile(!!mq.matches);
    on();
    // Safari/older fallback
    if ((mq as any).addEventListener) (mq as any).addEventListener("change", on);
    else (mq as any).addListener(on);
    return () => {
      if ((mq as any).removeEventListener) (mq as any).removeEventListener("change", on);
      else (mq as any).removeListener(on);
    };
  }, []);


  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  // Payroll modal
  const [payOpen, setPayOpen] = useState(false);
  const [payEmpId, setPayEmpId] = useState<string | null>(null);

  const [payBonuses, setPayBonuses] = useState("0");
  const [payOtHours, setPayOtHours] = useState("0");
  const [payManualDed, setPayManualDed] = useState("0");
  // already_paid removed (tracked via Payments ledger)
  const [payLoanOverride, setPayLoanOverride] = useState(""); // empty = no override

  // Bonus / Deductions monthly ledger (multiple entries, editable + deletable)
  // Totals are saved into Salary.bonuses and Salary.manual_deductions.
  const [bonusEntries, setBonusEntries] = useState<MoneyEntry[]>([]);
  const [bonusAmt, setBonusAmt] = useState("");
  const [bonusReason, setBonusReason] = useState("");

  const [dedEntries, setDedEntries] = useState<MoneyEntry[]>([]);
  const [dedAmt, setDedAmt] = useState("");
  const [dedReason, setDedReason] = useState("");

  function _mkId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function _sumMoney(items: { amount: string }[]) {
    return (items || []).reduce((s, x) => s + (Number(x.amount || 0) || 0), 0);
  }

  function _updateBonus(fn: (prev: MoneyEntry[]) => MoneyEntry[]) {
    setBonusEntries((prev) => {
      const next = fn(prev);
      setPayBonuses(String(_sumMoney(next)));
      return next;
    });
  }

  function _updateDed(fn: (prev: MoneyEntry[]) => MoneyEntry[]) {
    setDedEntries((prev) => {
      const next = fn(prev);
      setPayManualDed(String(_sumMoney(next)));
      return next;
    });
  }

  const [savingPayroll, setSavingPayroll] = useState(false);

  // Salary Center modal (Payroll + Payments + Loans in one window)
  const [scOpen, setScOpen] = useState(false);
  const [scEmpId, setScEmpId] = useState<string | null>(null);
  const [scTab, setScTab] = useState<SalaryCenterTab>("payroll");

  function closeSalaryCenter() {
    setScOpen(false);
    setScEmpId(null);
    setScTab("payroll");

    // keep legacy modal flags closed (we won’t use the old 3 modals anymore)
    setPayOpen(false);
    setPaymOpen(false);
    setLoanOpen(false);

    // clear per-employee modal state
    setPayEmpId(null);
    setPaymEmpId(null);
    setLoanEmpId(null);

    setPaymRows([]);

    setBonusEntries([]);
    setBonusAmt("");
    setBonusReason("");

    setDedEntries([]);
    setDedAmt("");
    setDedReason("");
  }


  // Add employee modal
  const [empOpen, setEmpOpen] = useState(false);
  const [empDraft, setEmpDraft] = useState<any>({
    name: "",
    department: "",
    position: "",
    phone: "",
    email: "",
    hire_date: "",
    base_salary: "",
    default_bonus: "",
    is_active: true,
  });
  const [empBusy, setEmpBusy] = useState(false);

  // Edit employee modal
  const [empEditOpen, setEmpEditOpen] = useState(false);
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empEditDraft, setEmpEditDraft] = useState<any>({
    name: "",
    department: "",
    position: "",
    phone: "",
    email: "",
    hire_date: "",
    end_date: "",
    base_salary: "",
    default_bonus: "",
    is_active: true,
  });
  const [empEditBusy, setEmpEditBusy] = useState(false);

  // Add loan modal
  const [loanOpen, setLoanOpen] = useState(false);
  const [loanEmpId, setLoanEmpId] = useState<string | null>(null);
  const [loanPrincipal, setLoanPrincipal] = useState("");
  const [loanMonthly, setLoanMonthly] = useState("");
  const [loanBusy, setLoanBusy] = useState(false);


  // Email capture modal for creating a user
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailEmpId, setEmailEmpId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  // Role pick for creating user from HR screen
  const [createUserRole, setCreateUserRole] = useState<string>("site_supervisor");
  const [emailRole, setEmailRole] = useState<string>("site_supervisor");

  // One-time password reveal
  const [pwOpen, setPwOpen] = useState(false);
  const [pwEmail, setPwEmail] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState<string | null>(null);
  const [pwTitle, setPwTitle] = useState<string>("");

  // Attendance modal
  const [attOpen, setAttOpen] = useState(false);
  const [attEmpId, setAttEmpId] = useState<string | null>(null);
  const [attRows, setAttRows] = useState<AttendanceRow[]>([]);
  const [attBusy, setAttBusy] = useState(false);

  // Attendance range picker (flight-style)
  const [attPickStart, setAttPickStart] = useState<number | null>(null);
  const [attPickEnd, setAttPickEnd] = useState<number | null>(null);
  const [attBulkStatus, setAttBulkStatus] = useState<string>("leave");
  const [attBulkDeduct, setAttBulkDeduct] = useState<boolean>(true);
  const [attBulkBusy, setAttBulkBusy] = useState(false);

  // Attendance safety: disable/skip days outside employment dates
  const attEmp = attEmpId ? employees.find((x) => x.id === attEmpId) : null;
  const attHire = attEmp?.hire_date ? String(attEmp.hire_date).slice(0, 10) : null;
  const attEnd = attEmp?.end_date ? String(attEmp.end_date).slice(0, 10) : null;

  function attInEmployment(day: string) {
    const d = String(day || "").slice(0, 10);
    if (attHire && d < attHire) return false;
    if (attEnd && d > attEnd) return false;
    return true;
  }

  // Payments modal
  const [paymOpen, setPaymOpen] = useState(false);
  const [paymEmpId, setPaymEmpId] = useState<string | null>(null);
  const [paymRows, setPaymRows] = useState<PaymentRow[]>([]);
  const [paymBusy, setPaymBusy] = useState(false);

  const [paymAmount, setPaymAmount] = useState("");
  const [paymDate, setPaymDate] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [paymNote, setPaymNote] = useState("");
  const [paymDue, setPaymDue] = useState<number | null>(null); // remaining unpaid (for placeholder)

  async function loadAll() {
    setBusy(true);
    setErr(null);

    const results = await Promise.allSettled([
      apiFetch<Employee[]>("/hr/employees"),
      apiFetch<SalaryRow[]>("/hr/salaries"),
      apiFetch<LoanRow[]>("/hr/loans"),
      apiFetch<AppUser[]>("/admin/users"),
    ]);

    const [re, rs, rl, ru] = results;
    const errs: string[] = [];
    let ok = 0;

    if (re.status === "fulfilled") { ok++; setEmployees(Array.isArray(re.value) ? re.value : []); }
    else errs.push(String((re.reason as any)?.message || re.reason));

    if (rs.status === "fulfilled") { ok++; setSalaries(Array.isArray(rs.value) ? rs.value : []); }
    else errs.push(String((rs.reason as any)?.message || rs.reason));

    if (rl.status === "fulfilled") { ok++; setLoans(Array.isArray(rl.value) ? rl.value : []); }
    else errs.push(String((rl.reason as any)?.message || rl.reason));

    if (ru.status === "fulfilled") { ok++; setUsers(Array.isArray(ru.value) ? ru.value : []); }
    else errs.push(String((ru.reason as any)?.message || ru.reason));

    if (ok === 0) {
      setApiOnline(false);
      setErr(errs.join(" | "));
      setBusy(false);
      return;
    }

    setApiOnline(ok === 4);
    if (errs.length) setErr(errs.join(" | "));
    setBusy(false);
  }

  useEffect(() => { loadAll(); }, []);

  const usersByEmployeeId = useMemo(() => {
    const m = new Map<string, AppUser>();
    for (const u of users) if (u.employee_id) m.set(u.employee_id, u);
    return m;
  }, [users]);

  const usersByEmail = useMemo(() => {
    const m = new Map<string, AppUser>();
    for (const u of users || []) {
      const k = normEmail(u.email);
      if (k) m.set(k, u);
    }
    return m;
  }, [users]);

  const salaryByEmpMonth = useMemo(() => {
    const m = new Map<string, SalaryRow>();
    for (const s of salaries) if (s.employee_id && s.month === month) m.set(s.employee_id, s);
    return m;
  }, [salaries, month]);

  const loanAggByEmp = useMemo(() => {
    const m = new Map<string, { remaining: number }>();
    for (const l of loans) {
      if (!l.employee_id) continue;
      const cur = m.get(l.employee_id) || { remaining: 0 };
      if (String(l.status || "").toLowerCase() !== "closed") cur.remaining += Number(l.remaining || 0);
      m.set(l.employee_id, cur);
    }
    return m;
  }, [loans]);

  const filteredEmployees = useMemo(() => {
    const { start, end } = _monthRange(month);

    function parseYMD(s: string) {
      const t = String(s || "").slice(0, 10);
      const [yy, mm, dd] = t.split("-").map((x) => Number(x));
      if (!yy || !mm || !dd) return null;
      return new Date(Date.UTC(yy, mm - 1, dd));
    }

    function isInMonth(e: Employee) {
      const hs = e.hire_date ? parseYMD(e.hire_date) : null;
      const ed = e.end_date ? parseYMD(e.end_date) : null;

      // end_date is inclusive → convert to exclusive end by adding 1 day
      const endExclusive = ed ? new Date(ed.getTime() + 24 * 60 * 60 * 1000) : null;

      // show if employment overlaps [start, end)
      if (hs && hs >= end) return false;
      if (endExclusive && endExclusive <= start) return false;
      return true;
    }

    const base = (employees || []).filter(isInMonth);

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter((e) => {
      const hay = `${e.name || ""} ${e.department || ""} ${e.position || ""} ${e.phone || ""} ${e.email || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [employees, q, month]);

  const stats = useMemo(() => {
    const active = employees.filter((x) => x.is_active !== false).length;
    let payrollNet = 0;
    let otTotal = 0;
    let loanRemain = 0;
    let totalUnpaid = 0;

    for (const e of employees) {
      const sal = salaryByEmpMonth.get(e.id);
      if (sal?.net != null) {
        const n = Number(sal.net || 0);
        payrollNet += n;
        if (n > 0) totalUnpaid += n;
      }
      if (sal?.overtime_pay != null) otTotal += Number(sal.overtime_pay || 0);

      const agg = loanAggByEmp.get(e.id);
      if (agg) loanRemain += agg.remaining;
    }

    return { active, payrollNet, otTotal, loanRemain, totalUnpaid };
  }, [employees, salaryByEmpMonth, loanAggByEmp]);
  function calcUnpaidForPayments(empId: string, rows: PaymentRow[]) {
    const sal = salaryByEmpMonth.get(empId);
    if (!sal) return null;

    const paymentsTotal = (rows || []).reduce((s, x) => s + Number(x.amount || 0), 0);

    const net = Number(sal.net || 0);
    const alreadyPaid = Number(sal.already_paid || 0);

    // If salary row is stale, adjust using the actual payments list.
    const due = (net + alreadyPaid) - paymentsTotal;
    return Math.max(0, due);
  }

  useEffect(() => {
    if (!scOpen || scTab !== "payments" || !paymEmpId) return;
    const due = calcUnpaidForPayments(paymEmpId, paymRows);
    setPaymDue(due);
  }, [scOpen, scTab, paymEmpId, paymRows, salaryByEmpMonth]);

  function openPayroll(empId: string) {
    const sal = salaryByEmpMonth.get(empId);

    setPayEmpId(empId);

    const b = Number(sal?.bonuses ?? 0) || 0;
    const d = Number(sal?.manual_deductions ?? 0) || 0;

    // start with 0 or a single “imported total” line (because backend only stores totals)
    setBonusEntries(b > 0 ? [{ id: _mkId(), amount: String(b), reason: "" }] : []);
    setDedEntries(d > 0 ? [{ id: _mkId(), amount: String(d), reason: "" }] : []);

    setPayBonuses(String(b));
    setPayManualDed(String(d));

    setBonusAmt("");
    setBonusReason("");
    setDedAmt("");
    setDedReason("");

    setPayOtHours(String(sal?.overtime_hours ?? 0));
    // already_paid removed (tracked via Payments ledger)
    setPayLoanOverride(hasOpenLoan(empId) ? (sal?.loan_override == null ? "" : String(sal.loan_override)) : "");

    setScEmpId(empId);
    setScTab("payroll");
    setScOpen(true);
  }

  async function savePayroll() {
    if (!payEmpId) return;
    setSavingPayroll(true);
    setErr(null);

    try {
      await apiFetch("/hr/salaries", {
        method: "POST",
        body: JSON.stringify({
          employee_id: payEmpId,
          month,

          bonuses: Number(payBonuses || 0),
          overtime_hours: Number(payOtHours || 0),
          manual_deductions: Number(payManualDed || 0),
          already_paid: 0,

          loan_override: payLoanOverride.trim() === "" ? null : Number(payLoanOverride),
          apply_loans: true,
          status: "draft",
        }),
      });

      closeSalaryCenter();
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingPayroll(false);
    }
  }

  function hasOpenLoan(empId: string) {
    return (loanAggByEmp.get(empId)?.remaining || 0) > 0;
  }


  async function deleteEmployeeRow(empId: string) {
    const empName = employees.find((x) => x.id === empId)?.name || "employee";
    if (!window.confirm(`Delete ${empName}?\n\nThis will delete their payroll rows, attendance, payments, and loans.`)) return;

    setErr(null);
    try {
      await apiFetch(`/hr/employees/${empId}`, { method: "DELETE" });

      // close modals if they were open for this employee
      if (payEmpId === empId) { setPayOpen(false); setPayEmpId(null); }
      if (attEmpId === empId) { setAttOpen(false); setAttEmpId(null); setAttRows([]); }
      if (paymEmpId === empId) { setPaymOpen(false); setPaymEmpId(null); setPaymRows([]); }
      if (loanEmpId === empId) { setLoanOpen(false); setLoanEmpId(null); }
      if (empEditId === empId) { setEmpEditOpen(false); setEmpEditId(null); }

      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function deletePaymentRow(paymentId: string) {
    if (!paymEmpId) return;
    if (!window.confirm("Delete this payment?")) return;

    setErr(null);
    try {
      await apiFetch(`/hr/payments/${paymentId}`, { method: "DELETE" });
      setPaymRows((prev) => prev.filter((p) => p.id !== paymentId));

      await recalcPayrollFor(paymEmpId);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }


  async function createEmployee() {
    const name = String(empDraft?.name || "").trim();
    if (!name) {
      setErr("Employee name is required");
      return;
    }

    setEmpBusy(true);
    setErr(null);
    try {
      await apiFetch("/hr/employees", {
        method: "POST",
        body: JSON.stringify({
          name,
          department: String(empDraft?.department || "").trim() || null,
          position: String(empDraft?.position || "").trim() || null,
          phone: String(empDraft?.phone || "").trim() || null,
          email: String(empDraft?.email || "").trim() || null,
          hire_date: String(empDraft?.hire_date || "").trim() || null,
          base_salary: empDraft?.base_salary ? Number(empDraft.base_salary) : null,
          default_bonus: empDraft?.default_bonus ? Number(empDraft.default_bonus) : null,
          is_active: empDraft?.is_active !== false,
        }),
      });
      setEmpOpen(false);
      setEmpDraft({ name: "", department: "", position: "", phone: "", email: "", hire_date: "", base_salary: "", default_bonus: "", is_active: true });
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setEmpBusy(false);
    }
  }

  function openEditEmployee(emp: Employee) {
    setEmpEditId(emp.id);
    setEmpEditDraft({
      name: String(emp.name || ""),
      department: String(emp.department || ""),
      position: String(emp.position || ""),
      phone: String(emp.phone || ""),
      email: String(emp.email || ""),
      hire_date: emp.hire_date ? String(emp.hire_date).slice(0, 10) : "",
      end_date: emp.end_date ? String(emp.end_date).slice(0, 10) : "",
      base_salary: emp.base_salary == null ? "" : String(emp.base_salary),
      default_bonus: emp.default_bonus == null ? "" : String(emp.default_bonus),
      is_active: emp.is_active !== false,
    });
    setEmpEditOpen(true);
  }

  async function saveEditEmployee() {
    if (!empEditId) return;

    const name = String(empEditDraft?.name || "").trim();
    if (!name) {
      setErr("Employee name is required");
      return;
    }

    setEmpEditBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/employees/${empEditId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          department: String(empEditDraft?.department || "").trim() || null,
          position: String(empEditDraft?.position || "").trim() || null,
          phone: String(empEditDraft?.phone || "").trim() || null,
          email: String(empEditDraft?.email || "").trim() || null,
          hire_date: String(empEditDraft?.hire_date || "").trim() || null,
          end_date: String(empEditDraft?.end_date || "").trim() || null,
          base_salary: String(empEditDraft?.base_salary || "").trim() === "" ? null : Number(empEditDraft.base_salary),
          default_bonus: String(empEditDraft?.default_bonus || "").trim() === "" ? null : Number(empEditDraft.default_bonus),
          is_active: empEditDraft?.is_active !== false,
        }),
      });

      setEmpEditOpen(false);
      setEmpEditId(null);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setEmpEditBusy(false);
    }
  }

  function openLoan(empId: string) {
    setLoanEmpId(empId);
    setLoanPrincipal("");
    setLoanMonthly("");

    setScEmpId(empId);
    setScTab("loans");
    setScOpen(true);
  }

  function _monthRange(ym: string) {
    const [yy, mm] = ym.split("-");
    const y = Number(yy);
    const m = Number(mm);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    return { y, m, start, end };
  }

  function _daysInMonth(ym: string) {
    const { y, m } = _monthRange(ym);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return last;
  }

  async function openAttendance(empId: string) {
    setAttEmpId(empId);
    setAttOpen(true);
    setAttBusy(true);
    setErr(null);

    // reset range UI
    setAttPickStart(null);
    setAttPickEnd(null);
    setAttBulkStatus("leave");
    setAttBulkDeduct(true);
    setAttBulkBusy(false);

    try {
      const rows = await apiFetch<AttendanceRow[]>(`/hr/attendance?month=${month}&employee_id=${empId}`);
      setAttRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setAttRows([]);
    } finally {
      setAttBusy(false);
    }
  }

  function _firstDowMon(ym: string) {
    const { y, m } = _monthRange(ym);
    const dowSun0 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0..6, Sun=0
    return (dowSun0 + 6) % 7; // 0..6, Mon=0
  }

  function _pad2(n: number) {
    return String(n).padStart(2, "0");
  }

  function DatePicker({
    value,
    onChange,
    placeholder = "YYYY-MM-DD",
    width = "100%",
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    width?: number | string;
  }) {
    const [open, setOpen] = useState(false);

    // When used inside CSS grid cells, inline-block can shrink and cause weird layout.
    // If width is set to 100%, we force the wrapper to be block-level and full width.
    const _fullWidth = width === "100%";

    const parseYmFromValue = (v: string) => {
      const s = String(v || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
      return currentMonthYYYYMM();
    };

    const [ym, setYm] = useState<string>(parseYmFromValue(value));

    useEffect(() => {
      if (open) setYm(parseYmFromValue(value));
    }, [open, value]);

    const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? Number(String(value).slice(8, 10)) : null;

    const pad = _firstDowMon(ym);
    const dim = _daysInMonth(ym);

    const cells: Array<number | null> = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div style={{ position: "relative", display: _fullWidth ? "block" : "inline-block", width: _fullWidth ? "100%" : undefined }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: "8px 34px 8px 10px",
            borderRadius: 12,
            border: "1px solid #30363d",
            background: "#0b0f17",
            color: "#e6edf3",
            width,
            fontWeight: 900,
            cursor: "pointer",
            textAlign: "left",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxSizing: "border-box",
          }}
          title="Pick date"
        >
          {value || placeholder}
          <span style={{ float: "right", opacity: 0.9 }}>▾</span>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />

            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                zIndex: 50,
                width: 320,
                maxWidth: "90vw",
                border: "1px solid #30363d",
                borderRadius: 14,
                background: "#0f1623",
                boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
                padding: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <button
                  onClick={() => setYm(_ymAdd(ym, -1))}
                  style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 950, cursor: "pointer" }}
                  aria-label="Previous month"
                >
                  ←
                </button>

                <div style={{ fontWeight: 950, opacity: 0.95 }}>{ym}</div>

                <button
                  onClick={() => setYm(_ymAdd(ym, +1))}
                  style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 950, cursor: "pointer" }}
                  aria-label="Next month"
                >
                  →
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 8, fontSize: 11, opacity: 0.8, textAlign: "center" }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {cells.map((d, idx) => {
                  if (!d) return <div key={`x-${idx}`} style={{ height: 34 }} />;

                  const active = d === selectedDay && String(value || "").slice(0, 7) === ym;

                  return (
                    <button
                      key={`${ym}-${d}`}
                      onClick={() => {
                        onChange(`${ym}-${_pad2(d)}`);
                        setOpen(false);
                      }}
                      style={{
                        height: 34,
                        borderRadius: 10,
                        border: active ? "1px solid #1f6feb" : "1px solid #30363d",
                        background: active ? "#1f6feb" : "#0b0f17",
                        color: "#e6edf3",
                        fontWeight: active ? 950 : 800,
                        cursor: "pointer",
                      }}
                      title={`${ym}-${_pad2(d)}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }


  async function upsertAttendance(day: string, status: string, deduct: boolean) {
    if (!attEmpId) return null;

    const st = String(status || "present").trim().toLowerCase();
    const ded = st === "present" ? false : !!deduct;

    const row = await apiFetch<AttendanceRow>("/hr/attendance", {
      method: "POST",
      body: JSON.stringify({
        employee_id: attEmpId,
        day,
        status: st,
        deduct: ded,
        note: null,
      }),
    });

    // update local list (upsert)
    setAttRows((prev) => {
      const idx = prev.findIndex((x) => x.day === row.day);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = row;
        return copy;
      }
      return [...prev, row].sort((a, b) => a.day.localeCompare(b.day));
    });

    return row;
  }

  async function saveAttendance(day: string, status: string, deduct: boolean) {
    if (!attEmpId) return;
    setErr(null);
    try {
      await upsertAttendance(day, status, deduct);

      // Recalc salary row so main table updates immediately
      await recalcPayrollFor(attEmpId);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function applyAttendanceRange() {
    if (!attEmpId) return;
    if (attPickStart == null) return;

    const a = attPickStart;
    const b = attPickEnd ?? attPickStart;
    const startDay = Math.min(a, b);
    const endDay = Math.max(a, b);

    setAttBulkBusy(true);
    setErr(null);
    try {
      for (let dayNo = startDay; dayNo <= endDay; dayNo++) {
        const day = `${month}-${_pad2(dayNo)}`;
        if (!attInEmployment(day)) continue;
        await upsertAttendance(day, attBulkStatus, attBulkStatus === "present" ? false : attBulkDeduct);
      }

      await recalcPayrollFor(attEmpId);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setAttBulkBusy(false);
    }
  }

  async function openPayments(empId: string) {
    setPaymEmpId(empId);

    setScEmpId(empId);
    setScTab("payments");
    setScOpen(true);

    setPaymBusy(true);
    setErr(null);
    setPaymAmount("");
    setPaymNote("");
    setPaymDue(null);
    setPaymDate(new Date().toISOString().slice(0, 10));
    try {
      const rows = await apiFetch<PaymentRow[]>(`/hr/payments?month=${month}&employee_id=${empId}`);
      setPaymRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setPaymRows([]);
    } finally {
      setPaymBusy(false);
    }
  }

  async function recalcPayrollFor(empId: string) {
    // Re-upsert salary for this employee+month so net reflects new attendance/payments.
    // This won't double-deduct loans because backend blocks loan re-apply when loan_deduction already exists.
    const s = salaryByEmpMonth.get(empId);

    const extraBonus = Number((s?.bonuses ?? 0) as any) || 0;
    const ot = Number((s?.overtime_hours ?? 0) as any) || 0;
    const md = Number((s?.manual_deductions ?? 0) as any) || 0;

    const lo = s?.loan_override == null ? null : Number(s.loan_override as any);
    const status = (s?.status || "draft") as string;

    await apiFetch("/hr/salaries", {
      method: "POST",
      body: JSON.stringify({
        employee_id: empId,
        month,
        bonuses: extraBonus,              // extra bonus (this month)
        overtime_hours: ot,
        manual_deductions: md,
        already_paid: 0,                  // deprecated in UI
        loan_override: lo,
        apply_loans: true,
        status,
      }),
    });
  }

  async function addPayment() {
    if (!paymEmpId) return;
    const amt = Number(paymAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Payment amount must be > 0");
      return;
    }
    if (!paymDate.trim()) {
      setErr("Payment date is required");
      return;
    }

    setPaymBusy(true);
    setErr(null);
    try {
      const created = await apiFetch<PaymentRow>("/hr/payments", {
        method: "POST",
        body: JSON.stringify({
          employee_id: paymEmpId,
          month,
          amount: amt,
          paid_on: paymDate,
          note: paymNote.trim() || null,
        }),
      });

      setPaymRows((prev) => [...prev, created].sort((a, b) => a.paid_on.localeCompare(b.paid_on)));
      setPaymAmount("");
      setPaymNote("");

      await recalcPayrollFor(paymEmpId);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setPaymBusy(false);
    }
  }

  async function createLoan() {
    if (!loanEmpId) return;
    const principal = Number(loanPrincipal || 0);
    if (!Number.isFinite(principal) || principal <= 0) {
      setErr("Loan principal must be > 0");
      return;
    }
    const md = loanMonthly.trim() === "" ? null : Number(loanMonthly);

    setLoanBusy(true);
    setErr(null);
    try {
      await apiFetch("/hr/loans", {
        method: "POST",
        body: JSON.stringify({
          employee_id: loanEmpId,
          principal,
          monthly_deduction: md,
        }),
      });

      // stay open: clear inputs + refresh list
      setLoanPrincipal("");
      setLoanMonthly("");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoanBusy(false);
    }
  }
  async function deleteLoan(loanId: string) {
    if (!loanEmpId) return;
    if (!window.confirm("Delete this loan?")) return;

    setErr(null);
    try {
      await apiFetch(`/hr/loans/${loanId}`, { method: "DELETE" });

      // instant UI update
      setLoans((prev) => prev.filter((x) => x.id !== loanId));

      // IMPORTANT: recalc payroll so stored salary.loan_deduction can be cleared
      await recalcPayrollFor(loanEmpId);

      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function createUserForEmployee(empId: string, role: string, email: string) {
    const em = normEmail(email);
    if (!em) {
      setErr("Email is required");
      return;
    }

    setErr(null);

    async function genTempPassword(userId: string) {
      const res = await apiFetch<AppUser>(`/admin/users/${userId}/reset_password`, { method: "POST" });

      setPwTitle("Temporary password generated");
      setPwEmail(res.email);
      setPwValue(res.temp_password || null);
      setPwOpen(true);
    }

    async function tryAttach(user: AppUser) {
      // safety: don't hijack someone else's user if it's already linked elsewhere
      if (user.employee_id && user.employee_id !== empId) {
        setErr(`This email is already used by another employee/user (${user.role?.toUpperCase?.() || "USER"} • ${user.email}). Use a different email.`);
        return false;
      }

      try {
        await apiFetch<AppUser>(`/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ employee_id: empId, role, is_active: true }),
        });
      } catch {
        // ignore (some backends don't support PATCH here)
      }
      return true;
    }

    async function findUserByEmail(): Promise<AppUser | null> {
      // local cache first (fast)
      const local = (users || []).find((u) => normEmail(u.email) === em);
      if (local) return local;

      // try filtered endpoint if backend supports it
      try {
        const arr = await apiFetch<AppUser[]>(`/admin/users?email=${encodeURIComponent(em)}`);
        const hit = (arr || []).find((u) => normEmail(u.email) === em);
        if (hit) return hit;
      } catch {
        // ignore
      }

      // fallback to full list
      try {
        const arr2 = await apiFetch<AppUser[]>("/admin/users");
        const hit2 = (arr2 || []).find((u) => normEmail(u.email) === em);
        return hit2 || null;
      } catch {
        return null;
      }
    }

    // 1) If user already exists, link it (if safe) + generate temp password
    const existing = await findUserByEmail();
    if (existing) {
      const ok = await tryAttach(existing);
      if (!ok) return;
      await genTempPassword(existing.id);
      await loadAll();
      return;
    }

    // 2) Otherwise create it
    try {
      const created = await apiFetch<AppUser>("/admin/users", {
        method: "POST",
        body: JSON.stringify({ employee_id: empId, role, email: em, is_active: true }),
      });

      await genTempPassword(created.id);
      await loadAll();
      return;
    } catch (e: any) {
      const msg = String(e?.message || e || "");

      // If backend says it exists, try to find it again (sometimes DB is ahead of list/permissions)
      if (msg.toLowerCase().includes("exist")) {
        const ex2 = await findUserByEmail();
        if (ex2) {
          const ok = await tryAttach(ex2);
          if (!ok) return;
          await genTempPassword(ex2.id);
          await loadAll();
          return;
        }

        setErr(`This email already exists in the system (${em}), but your account can’t fetch the user record to link it. Ask admin to link/reset it, or use a different email.`);
        return;
      }

      setErr(msg);
    }
  }

  async function resetUserPassword(userId: string) {

    try {
      const res = await apiFetch<AppUser>(`/admin/users/${userId}/reset_password`, { method: "POST" });

      setPwTitle("Password reset");
      setPwEmail(res.email);
      setPwValue(res.temp_password || null);
      setPwOpen(true);

      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  function startCreateUser(emp: Employee) {
    const email = String(emp.email || "").trim().toLowerCase();
    if (!email) {
      setEmailEmpId(emp.id);
      setEmailDraft("");
      setEmailRole(createUserRole);
      setEmailOpen(true);
      return;
    }
    createUserForEmployee(emp.id, createUserRole, email);
  }

  async function deleteAppUser(userId: string) {
    if (!window.confirm("Delete this user account?")) return;

    setErr(null);
    try {
      await apiFetch(`/admin/users/${userId}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function saveEmployeeEmailAndCreateUser() {
    if (!emailEmpId) return;
    const email = emailDraft.trim().toLowerCase();
    if (!email) return;

    setEmailBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/employees/${emailEmpId}`, {
        method: "PATCH",
        body: JSON.stringify({ email }),
      });

      setEmailOpen(false);
      await createUserForEmployee(emailEmpId, emailRole, email);

      setEmailEmpId(null);
      setEmailDraft("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setEmailBusy(false);
    }
  }

  if (!canHr) {
    return (
      <div style={{ padding: 18, color: "#e6edf3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>HR Payroll</div>
        <div style={{ marginTop: 12, opacity: 0.85 }}>Ask admin to grant hr/admin.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 8 : 12, color: "#e6edf3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>🧑‍💼 HR Payroll</div>
          {!apiOnline && <div style={pill("rgba(255, 123, 114, 0.10)")}>Offline mode</div>}
          {apiOnline && <div style={pill("rgba(46, 160, 67, 0.12)")}>Live</div>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <MonthYearPicker value={month} onChange={setMonth} />


            <div
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.9,
                fontWeight: 950,
                fontSize: 12,
              }}
            >
              ▾
            </div>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees…"
            style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", width: isMobile ? "100%" : 240, maxWidth: "100%" }}
          />
          <button onClick={() => setEmpOpen(true)} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}>
            + Employee
          </button>
          <button onClick={loadAll} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
            Refresh
          </button>
          <button onClick={() => router.push("/projects")} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
            ← Projects
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 10, color: "#ff7b72" }}>{String(err)}</div>}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
        <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0f1623", padding: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Active employees</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{stats.active}</div>
        </div>
        <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0f1623", padding: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Payroll net ({month})</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{fmtMoney(stats.payrollNet)}</div>
        </div>
        <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0f1623", padding: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Overtime pay ({month})</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{fmtMoney(stats.otTotal)}</div>
        </div>
        <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0f1623", padding: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Loans remaining</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{fmtMoney(stats.loanRemain)}</div>
        </div>
        <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0f1623", padding: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Total unpaid ({month})</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{fmtMoney(stats.totalUnpaid)}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", overflow: "hidden" }}>
        <div style={{ padding: 10, borderBottom: "1px solid #30363d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 950 }}>Employees</div>
          {busy && <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 900 }}>Loading…</div>}
        </div>

        {isMobile ? (
          <div style={{ padding: 10, display: "grid", gap: 10 }}>
            {filteredEmployees.map((e) => {
              const sal = salaryByEmpMonth.get(e.id);
              const agg = loanAggByEmp.get(e.id) || { remaining: 0 };
              const uById = usersByEmployeeId.get(e.id);
              const uByEmail = e.email ? usersByEmail.get(normEmail(e.email)) : undefined;
              const u = uById || (uByEmail && (!uByEmail.employee_id || uByEmail.employee_id === e.id) ? uByEmail : undefined);

              return (
                <div key={e.id} style={{ border: "1px solid #30363d", borderRadius: 16, background: "#0b0f17", padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <button
                        onClick={() => openEditEmployee(e)}
                        style={{ fontWeight: 950, background: "transparent", border: "none", padding: 0, color: "#58a6ff", cursor: "pointer", textAlign: "left" }}
                        title="Edit employee"
                      >
                        {e.name}
                      </button>
                      <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>
                        {(e.department || "-")}{e.position ? ` • ${e.position}` : ""}{e.is_active === false ? " • Inactive" : ""}
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{e.email ? e.email : "No email"}</div>
                      {u ? (
                        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>
                          User: <b>{u.role.toUpperCase()}</b> • {u.email}
                        </div>
                      ) : (
                        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>User: None</div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>{fmtMoney(sal?.net)}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{sal?.status ? String(sal.status).toUpperCase() : "—"}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>Base: <b>{fmtMoney(e.base_salary)}</b></div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>Default bonus: <b>{fmtMoney(e.default_bonus ?? 0)}</b></div>

                    <div style={{ opacity: 0.85, fontSize: 12 }}>Extra bonus: <b>{fmtMoney(sal?.bonuses ?? 0)}</b></div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>OT: <b>{sal?.overtime_hours ?? "-"} hrs</b> • {fmtMoney(sal?.overtime_pay)}</div>

                    <div style={{ opacity: 0.85, fontSize: 12 }}>Deductions: <b>{fmtMoney(sal?.deductions ?? 0)}</b></div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>Already paid: <b>{fmtMoney(sal?.already_paid ?? 0)}</b></div>

                    <div style={{ opacity: 0.85, fontSize: 12 }}>Loan (month): <b>{fmtMoney(sal?.loan_deduction ?? 0)}</b></div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>Loan remaining: <b>{fmtMoney(agg.remaining)}</b></div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openPayroll(e.id)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 950, flex: "1 1 140px" }}>
                      Salary
                    </button>
                    <button onClick={() => openAttendance(e.id)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 950, flex: "1 1 140px" }}>
                      Attendance
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredEmployees.length === 0 && <div style={{ padding: 12, opacity: 0.75 }}>No employees.</div>}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1250 }}>

            <thead>
              <tr style={{ background: "#0b0f17" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #30363d" }}>Employee</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Base</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Default bonus</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Extra bonus</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>OT hrs</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>OT pay</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Deductions</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Loan (month)</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Loan remaining</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Net ({month})</th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #30363d" }}>Already paid</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #30363d" }}>User</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #30363d" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((e) => {
                const sal = salaryByEmpMonth.get(e.id);
                const agg = loanAggByEmp.get(e.id) || { remaining: 0 };
                const uById = usersByEmployeeId.get(e.id);
                const uByEmail = e.email ? usersByEmail.get(normEmail(e.email)) : undefined;
                const u = uById || (uByEmail && (!uByEmail.employee_id || uByEmail.employee_id === e.id) ? uByEmail : undefined);

                return (
                  <tr key={e.id} style={{ borderTop: "1px solid #121826" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <button
                        onClick={() => openEditEmployee(e)}
                        style={{
                          fontWeight: 950,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "#58a6ff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        title="Edit employee"
                      >
                        {e.name}
                      </button>

                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        {(e.department || "-")}{e.position ? ` • ${e.position}` : ""}{e.is_active === false ? " • Inactive" : ""}
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        {e.email ? e.email : "No email"}
                      </div>
                    </td>

                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(e.base_salary)}</td>
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(e.default_bonus ?? 0)}</td>
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(sal?.bonuses ?? 0)}</td>
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{sal?.overtime_hours ?? "-"}</td>
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(sal?.overtime_pay)}</td>
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>
                      {fmtMoney(sal?.deductions ?? 0)}
                    </td>

                    {/* Loan deduction applied this month */}
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(sal?.loan_deduction ?? 0)}</td>

                    {/* Total remaining across open loans */}
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(agg.remaining)}</td>

                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 950 }}>{fmtMoney(sal?.net)}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{sal?.status ? String(sal.status).toUpperCase() : "—"}</div>
                    </td>

                    {/* Sum of payments recorded for this month */}
                    <td style={{ padding: 10, textAlign: "right", verticalAlign: "top" }}>{fmtMoney(sal?.already_paid ?? 0)}</td>

                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      {u ? (
                        <>
                          <div style={{ fontWeight: 900 }}>{u.role.toUpperCase()}</div>
                          <div style={{ opacity: 0.75, fontSize: 12 }}>{u.email}</div>
                        </>
                      ) : (
                        <div style={{ opacity: 0.75 }}>None</div>
                      )}
                    </td>

                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => openPayroll(e.id)}
                          style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}
                        >
                          Salary
                        </button>

                        <button
                          onClick={() => openAttendance(e.id)}
                          style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
                        >
                          Attendance
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ padding: 14, opacity: 0.75 }}>No employees.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

        <div style={{ padding: 10, borderTop: "1px solid #30363d", fontSize: 12, opacity: 0.75 }}>
          Formula: <b>basic + default bonus + extra bonus + overtime − attendance deduction − manual deductions − already paid − loan(month)</b>. Hourly = basic / 30 / 8.
        </div>
      </div>
      {/* Salary Center modal (Payroll + Payments + Loans) */}
      {scOpen && scEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 95 }}>
          <div style={{ width: "min(980px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Salary Center • {employees.find((x) => x.id === scEmpId)?.name || "Employee"} • {month}
              </div>
              <button
                onClick={closeSalaryCenter}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            {/* Tabs */}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setScTab("payroll")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: scTab === "payroll" ? "#1f6feb" : "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                }}
              >
                Payroll
              </button>

              <button
                onClick={() => setScTab("bonus")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: scTab === "bonus" ? "#1f6feb" : "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                }}
              >
                Bonus
              </button>

              <button
                onClick={() => setScTab("deductions")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: scTab === "deductions" ? "#1f6feb" : "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                }}
              >
                Deductions
              </button>

              <button
                onClick={() => openPayments(scEmpId)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: scTab === "payments" ? "#1f6feb" : "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                }}
              >
                Payments
              </button>

              <button
                onClick={() => openLoan(scEmpId)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #30363d",
                  background: scTab === "loans" ? "#1f6feb" : "#0b0f17",
                  color: "#e6edf3",
                  fontWeight: 900,
                }}
              >
                Loans
              </button>
            </div>

            {/* Summary */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              {(() => {
                const sal = salaryByEmpMonth.get(scEmpId);
                const agg = loanAggByEmp.get(scEmpId);
                const paymentsTotal = paymEmpId === scEmpId ? paymRows.reduce((s, x) => s + Number(x.amount || 0), 0) : 0;

                return (
                  <>
                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Net ({month})</div>
                      <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4 }}>{fmtMoney(sal?.net ?? 0)}</div>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Paid ({month})</div>
                      <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4 }}>{fmtMoney(paymentsTotal)}</div>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Loan (month)</div>
                      <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4 }}>{fmtMoney(sal?.loan_deduction ?? 0)}</div>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Loan remaining</div>
                      <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4 }}>{fmtMoney(agg?.remaining ?? 0)}</div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Tab content */}
            {scTab === "payroll" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 10, alignItems: "start" }}>
                  {/* Left: inputs */}
                  <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 10 }}>Inputs</div>

                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Overtime hours</div>
                      <input
                        value={payOtHours}
                        onChange={(e) => setPayOtHours(e.target.value)}
                        style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                      />
                    </label>

                    <div style={{ height: 10 }} />

                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Loan override (optional)</div>
                      <input
                        value={payLoanOverride}
                        onChange={(e) => setPayLoanOverride(e.target.value)}
                        placeholder={hasOpenLoan(scEmpId) ? "empty = auto" : "no active loans"}
                        disabled={!hasOpenLoan(scEmpId)}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid #30363d",
                          background: "#0f1623",
                          color: "#e6edf3",
                          opacity: hasOpenLoan(scEmpId) ? 1 : 0.7,
                        }}
                      />
                    </label>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
                      Loans auto-apply once per employee per month. Override changes salary for this month without double-deducting balances.
                    </div>
                  </div>

                  {/* Right: manage cards (all same size) */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Bonus</div>
                        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{fmtMoney(Number(payBonuses || 0))}</div>
                      </div>
                      <button
                        onClick={() => setScTab("bonus")}
                        style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 900 }}
                      >
                        Manage bonus
                      </button>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Deductions</div>
                        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{fmtMoney(Number(payManualDed || 0))}</div>
                      </div>
                      <button
                        onClick={() => setScTab("deductions")}
                        style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 900 }}
                      >
                        Manage deductions
                      </button>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Payments</div>
                        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                          {fmtMoney(Number(salaryByEmpMonth.get(scEmpId)?.already_paid ?? 0) || 0)}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                          Due: {fmtMoney(Math.max(0, (Number(salaryByEmpMonth.get(scEmpId)?.net ?? 0) || 0) - (Number(salaryByEmpMonth.get(scEmpId)?.already_paid ?? 0) || 0)))}
                        </div>
                      </div>
                      <button
                        onClick={() => openPayments(scEmpId)}
                        style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 900 }}
                      >
                        Manage payments
                      </button>
                    </div>

                    <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Loans</div>
                        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                          {fmtMoney(loanAggByEmp.get(scEmpId)?.remaining ?? 0)}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                          This month: {fmtMoney(salaryByEmpMonth.get(scEmpId)?.loan_deduction ?? 0)}
                        </div>
                      </div>
                      <button
                        onClick={() => openLoan(scEmpId)}
                        style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3", fontWeight: 900 }}
                      >
                        Manage loans
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={closeSalaryCenter} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                    Cancel
                  </button>
                  <button onClick={savePayroll} disabled={savingPayroll} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: savingPayroll ? 0.7 : 1 }}>
                    {savingPayroll ? "Saving…" : "Save payroll"}
                  </button>
                </div>
              </div>
            )}


            {scTab === "bonus" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 120px", gap: 10, alignItems: "center" }}>
                    <input
                      value={paymAmount}
                      onChange={(e) => setPaymAmount(e.target.value)}
                      placeholder={paymDue != null && paymDue > 0 ? `Due: ${fmtMoney(paymDue)}` : "Amount"}
                      style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis" }}
                    />

                    <input
                      value={paymDate}
                      onChange={(e) => setPaymDate(e.target.value)}
                      type="date"
                      style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                    />

                    <button
                      onClick={addPayment}
                      disabled={paymBusy}
                      style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: paymBusy ? 0.7 : 1 }}
                    >
                      {paymBusy ? "Saving…" : "Add"}
                    </button>
                  </div>

                  <input
                    value={paymNote}
                    onChange={(e) => setPaymNote(e.target.value)}
                    placeholder="Note (optional)"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                </div>


                <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Bonus entries</div>
                    <div style={{ fontWeight: 950 }}>Total: {fmtMoney(Number(payBonuses || 0))}</div>
                  </div>

                  <div style={{ marginTop: 10, maxHeight: 360, overflow: "auto" }}>
                    {bonusEntries.length === 0 && <div style={{ opacity: 0.7 }}>No bonus entries.</div>}

                    {bonusEntries.map((it) => (
                      <div key={it.id} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", gap: 10, padding: "8px 6px", borderTop: "1px solid #121826", alignItems: "center" }}>
                        <input
                          value={it.amount}
                          onChange={(e) => _updateBonus((prev) => prev.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)))}
                          style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                        />
                        <input
                          value={it.reason}
                          onChange={(e) => _updateBonus((prev) => prev.map((x) => (x.id === it.id ? { ...x, reason: e.target.value } : x)))}
                          placeholder="Reason"
                          style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                        />
                        <button
                          onClick={() => _updateBonus((prev) => prev.filter((x) => x.id !== it.id))}
                          style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setScTab("payroll")} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {scTab === "deductions" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 120px", gap: 10, alignItems: "center" }}>
                  <input
                    value={dedAmt}
                    onChange={(e) => setDedAmt(e.target.value)}
                    placeholder="Amount"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                  <input
                    value={dedReason}
                    onChange={(e) => setDedReason(e.target.value)}
                    placeholder="Reason"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                  <button
                    onClick={() => {
                      const amt = Number(dedAmt || 0);
                      if (!Number.isFinite(amt) || amt <= 0) {
                        setErr("Deduction amount must be > 0");
                        return;
                      }
                      _updateDed((prev) => [...prev, { id: _mkId(), amount: String(amt), reason: dedReason.trim() }]);
                      setDedAmt("");
                      setDedReason("");
                    }}
                    style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Deduction entries</div>
                    <div style={{ fontWeight: 950 }}>Total: {fmtMoney(Number(payManualDed || 0))}</div>
                  </div>

                  <div style={{ marginTop: 10, maxHeight: 360, overflow: "auto" }}>
                    {dedEntries.length === 0 && <div style={{ opacity: 0.7 }}>No deductions.</div>}

                    {dedEntries.map((it) => (
                      <div key={it.id} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", gap: 10, padding: "8px 6px", borderTop: "1px solid #121826", alignItems: "center" }}>
                        <input
                          value={it.amount}
                          onChange={(e) => _updateDed((prev) => prev.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)))}
                          style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                        />
                        <input
                          value={it.reason}
                          onChange={(e) => _updateDed((prev) => prev.map((x) => (x.id === it.id ? { ...x, reason: e.target.value } : x)))}
                          placeholder="Reason"
                          style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                        />
                        <button
                          onClick={() => _updateDed((prev) => prev.filter((x) => x.id !== it.id))}
                          style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setScTab("payroll")} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {scTab === "payments" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 120px", gap: 10, alignItems: "center" }}>
                    <input
                      value={paymAmount}
                      onChange={(e) => setPaymAmount(e.target.value)}
                      placeholder={paymDue != null && paymDue > 0 ? `Due: ${fmtMoney(paymDue)}` : "Amount"}
                      style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis" }}
                    />

                    <input
                      value={paymDate}
                      onChange={(e) => setPaymDate(e.target.value)}
                      type="date"
                      style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                    />

                    <button
                      onClick={addPayment}
                      disabled={paymBusy}
                      style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: paymBusy ? 0.7 : 1 }}
                    >
                      {paymBusy ? "Saving…" : "Add"}
                    </button>
                  </div>

                  <input
                    value={paymNote}
                    onChange={(e) => setPaymNote(e.target.value)}
                    placeholder="Note (optional)"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                </div>

                <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                    Payroll will subtract <b>sum(payments)</b> for this month automatically.
                  </div>

                  <div style={{ maxHeight: 360, overflow: "auto" }}>
                    {paymRows.length === 0 && <div style={{ opacity: 0.7 }}>No payments yet.</div>}

                    {paymRows.map((p) => (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px 90px", gap: 10, padding: "8px 6px", borderTop: "1px solid #121826", alignItems: "center" }}>
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas", fontSize: 12 }}>{p.paid_on}</div>
                        <div style={{ opacity: 0.85, fontSize: 12 }}>{p.note || "—"}</div>
                        <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney(p.amount)}</div>
                        <button
                          onClick={() => deletePaymentRow(p.id)}
                          style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}

                    {paymRows.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", fontWeight: 950 }}>
                        Total: {fmtMoney(paymRows.reduce((s, x) => s + Number(x.amount || 0), 0))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scTab === "loans" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 120px", gap: 10, alignItems: "center" }}>

                  <input
                    value={loanPrincipal}
                    onChange={(e) => setLoanPrincipal(e.target.value)}
                    placeholder="Principal amount"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                  <input
                    value={loanMonthly}
                    onChange={(e) => setLoanMonthly(e.target.value)}
                    placeholder="Monthly deduction (optional)"
                    style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                  />
                  <button
                    onClick={createLoan}
                    disabled={loanBusy}
                    style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: loanBusy ? 0.7 : 1 }}
                  >
                    {loanBusy ? "Saving…" : "Add loan"}
                  </button>
                </div>

                <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Existing loans for this employee</div>

                  <div style={{ maxHeight: 360, overflow: "auto" }}>
                    {loans.filter((l) => l.employee_id === loanEmpId).length === 0 && (
                      <div style={{ opacity: 0.7 }}>No loans yet.</div>
                    )}

                    {loans
                      .filter((l) => l.employee_id === loanEmpId)
                      .slice()
                      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
                      .map((l) => (
                        <div
                          key={l.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 160px 160px 160px 90px",
                            gap: 10,
                            padding: "8px 6px",
                            borderTop: "1px solid #121826",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.9 }}>
                            <div style={{ fontWeight: 950 }}>
                              {(String(l.status || "—")).toUpperCase()} • {l.created_at ? String(l.created_at).slice(0, 10) : "—"}
                            </div>
                            <div style={{ opacity: 0.75 }}>Monthly: {fmtMoney(l.monthly_deduction ?? 0)}</div>
                          </div>

                          <div style={{ textAlign: "right", fontWeight: 950 }}>Principal: {fmtMoney(l.principal ?? 0)}</div>
                          <div style={{ textAlign: "right", fontWeight: 950 }}>Remaining: {fmtMoney(l.remaining ?? 0)}</div>
                          <div style={{ textAlign: "right", fontWeight: 900 }}>{(String(l.status || "—")).toUpperCase()}</div>

                          <button
                            onClick={() => deleteLoan(l.id)}
                            style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payroll modal */}
      {payOpen && payEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 60 }}>
          <div style={{ width: "min(860px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Payroll • {employees.find((x) => x.id === payEmpId)?.name || "Employee"} • {month}
              </div>
              <button
                onClick={() => { setPayOpen(false); setPayEmpId(null); }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Extra bonus (this month)</div>
                  <input value={payBonuses} onChange={(e) => setPayBonuses(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Overtime hours</div>
                  <input value={payOtHours} onChange={(e) => setPayOtHours(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Manual deductions</div>
                  <input value={payManualDed} onChange={(e) => setPayManualDed(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

                {payEmpId && hasOpenLoan(payEmpId) && (
                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Loan override (this month)</div>
                    <input value={payLoanOverride} onChange={(e) => setPayLoanOverride(e.target.value)} placeholder="leave empty for auto" style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                  </label>
                )}
              </div>

              <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 12, fontSize: 12, opacity: 0.85 }}>
                Loans auto-apply once per employee per month. Override changes salary for this month without double-deducting balances.
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button onClick={closeSalaryCenter} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Cancel
              </button>
              <button onClick={savePayroll} disabled={savingPayroll} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: savingPayroll ? 0.7 : 1 }}>
                {savingPayroll ? "Saving…" : "Save payroll"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add Employee modal */}
      {empOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 70 }}>
          <div style={{ width: "min(980px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 950 }}>Add Employee</div>
              <button onClick={() => setEmpOpen(false)} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>Close</button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Full name">
                  <input value={empDraft.name} onChange={(e) => setEmpDraft((p: any) => ({ ...p, name: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Department">
                  <input value={empDraft.department} onChange={(e) => setEmpDraft((p: any) => ({ ...p, department: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Position">
                  <input value={empDraft.position} onChange={(e) => setEmpDraft((p: any) => ({ ...p, position: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Phone">
                  <input value={empDraft.phone} onChange={(e) => setEmpDraft((p: any) => ({ ...p, phone: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Email (optional)">
                  <input value={empDraft.email} onChange={(e) => setEmpDraft((p: any) => ({ ...p, email: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Start date">
                  <DatePicker
                    value={empDraft.hire_date}
                    onChange={(v) => setEmpDraft((p: any) => ({ ...p, hire_date: v }))}
                  />
                </Field>

                <Field label="Base salary">
                  <input value={empDraft.base_salary} onChange={(e) => setEmpDraft((p: any) => ({ ...p, base_salary: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>

                <Field label="Default bonus (monthly)">
                  <input value={empDraft.default_bonus} onChange={(e) => setEmpDraft((p: any) => ({ ...p, default_bonus: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>

                <Field label="Status">
                  <select value={empDraft.is_active === false ? "no" : "yes"} onChange={(e) => setEmpDraft((p: any) => ({ ...p, is_active: e.target.value !== "no" }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                    <option value="yes">Active</option>
                    <option value="no">Inactive</option>
                  </select>
                </Field>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEmpOpen(false)} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Cancel
              </button>
              <button onClick={createEmployee} disabled={empBusy} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: empBusy ? 0.7 : 1 }}>
                {empBusy ? "Saving…" : "Save employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee modal */}
      {empEditOpen && empEditId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 72 }}>
          <div style={{ width: "min(980px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Edit Employee • {employees.find((x) => x.id === empEditId)?.name || "Employee"}
              </div>
              <button
                onClick={() => { setEmpEditOpen(false); setEmpEditId(null); }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Full name">
                  <input value={empEditDraft.name} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, name: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Department">
                  <input value={empEditDraft.department} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, department: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Position">
                  <input value={empEditDraft.position} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, position: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Phone">
                  <input value={empEditDraft.phone} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, phone: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
                <Field label="Email (optional)">
                  <input value={empEditDraft.email} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, email: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                <Field label="Base salary">
                  <input value={empEditDraft.base_salary} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, base_salary: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>

                <Field label="Default bonus">
                  <input value={empEditDraft.default_bonus} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, default_bonus: e.target.value }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
                </Field>

                <Field label="Start date">
                  <DatePicker
                    value={empEditDraft.hire_date}
                    onChange={(v) => setEmpEditDraft((p: any) => ({ ...p, hire_date: v }))}
                  />
                </Field>

                <Field label="End date">
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <DatePicker
                      value={empEditDraft.end_date}
                      onChange={(v) => setEmpEditDraft((p: any) => ({ ...p, end_date: v }))}
                    />
                    {!!empEditDraft.end_date && (
                      <button
                        onClick={() => setEmpEditDraft((p: any) => ({ ...p, end_date: "" }))}
                        style={{ justifySelf: "end", padding: 0, border: "none", background: "transparent", color: "#8b949e", fontWeight: 900, cursor: "pointer" }}
                        title="Clear end date"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </Field>



                <Field label="Status">
                  <select value={empEditDraft.is_active === false ? "no" : "yes"} onChange={(e) => setEmpEditDraft((p: any) => ({ ...p, is_active: e.target.value !== "no" }))} style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}>
                    <option value="yes">Active</option>
                    <option value="no">Inactive</option>
                  </select>
                </Field>
              </div>
            </div>
            {/* User management */}
            <div style={{ marginTop: 12, borderTop: "1px solid #30363d", paddingTop: 12 }}>
              {(() => {
                const emp = employees.find((x) => x.id === empEditId);
                const u = empEditId ? usersByEmployeeId.get(empEditId) : undefined;

                return (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>User account</div>
                      <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                        {u ? `${u.role.toUpperCase()} • ${u.email}` : "No user linked to this employee"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!u && emp && (
                        <>
                          <select
                            value={createUserRole}
                            onChange={(e) => setCreateUserRole(e.target.value)}
                            style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
                          >
                            {USER_ROLE_OPTIONS.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.label}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => startCreateUser(emp)}
                            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
                          >
                            Create user
                          </button>
                        </>
                      )}

                      {u && (
                        <>
                          <button
                            onClick={() => resetUserPassword(u.id)}
                            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
                          >
                            Reset password
                          </button>

                          <button
                            onClick={() => deleteAppUser(u.id)}
                            style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                          >
                            Delete user
                          </button>
                        </>
                      )}

                      {/* Optional: move employee delete here */}
                      {empEditId && (
                        <button
                          onClick={() => deleteEmployeeRow(empEditId)}
                          style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                        >
                          Delete employee
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setEmpEditOpen(false); setEmpEditId(null); }} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Cancel
              </button>
              <button onClick={saveEditEmployee} disabled={empEditBusy} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: empEditBusy ? 0.7 : 1 }}>
                {empEditBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loans modal (add + list + delete) */}
      {loanOpen && loanEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 75 }}>
          <div style={{ width: "min(900px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Loans • {employees.find((x) => x.id === loanEmpId)?.name || "Employee"}
              </div>

              <button
                onClick={() => { setLoanOpen(false); setLoanEmpId(null); }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            {/* Add loan */}
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 10, alignItems: "center" }}>
                <input
                  value={loanPrincipal}
                  onChange={(e) => setLoanPrincipal(e.target.value)}
                  placeholder="Principal amount"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                />
                <input
                  value={loanMonthly}
                  onChange={(e) => setLoanMonthly(e.target.value)}
                  placeholder="Monthly deduction (optional)"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                />
                <button
                  onClick={createLoan}
                  disabled={loanBusy}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: loanBusy ? 0.7 : 1 }}
                >
                  {loanBusy ? "Saving…" : "Add loan"}
                </button>
              </div>
            </div>

            {/* Loans list */}
            <div style={{ marginTop: 12, border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                Existing loans for this employee
              </div>

              <div style={{ maxHeight: 360, overflow: "auto" }}>
                {loans.filter((l) => l.employee_id === loanEmpId).length === 0 && (
                  <div style={{ opacity: 0.7 }}>No loans yet.</div>
                )}

                {loans
                  .filter((l) => l.employee_id === loanEmpId)
                  .slice()
                  .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
                  .map((l) => (
                    <div
                      key={l.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 160px 160px 160px 90px",
                        gap: 10,
                        padding: "8px 6px",
                        borderTop: "1px solid #121826",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        <div style={{ fontWeight: 950 }}>
                          {(String(l.status || "—")).toUpperCase()} • {l.created_at ? String(l.created_at).slice(0, 10) : "—"}
                        </div>
                        <div style={{ opacity: 0.75 }}>
                          Monthly: {fmtMoney(l.monthly_deduction ?? 0)}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", fontWeight: 950 }}>Principal: {fmtMoney(l.principal ?? 0)}</div>
                      <div style={{ textAlign: "right", fontWeight: 950 }}>Remaining: {fmtMoney(l.remaining ?? 0)}</div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>{(String(l.status || "—")).toUpperCase()}</div>

                      <button
                        onClick={() => deleteLoan(l.id)}
                        style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email capture modal */}
      {emailOpen && emailEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 80 }}>
          <div style={{ width: "min(560px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ fontWeight: 950 }}>Add email to create user</div>
            <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12 }}>
              Employee doesn’t need email unless you create a user.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <select
                value={emailRole}
                onChange={(e) => setEmailRole(e.target.value)}
                style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
              >
                {USER_ROLE_OPTIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>

              <input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="employee@email.com" style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }} />
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setEmailOpen(false); setEmailEmpId(null); setEmailDraft(""); setEmailRole("site_supervisor"); }} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Cancel
              </button>
              <button onClick={saveEmployeeEmailAndCreateUser} disabled={emailBusy || !emailDraft.trim()} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: emailBusy || !emailDraft.trim() ? 0.7 : 1 }}>
                {emailBusy ? "Saving…" : "Save & create user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance modal */}
      {attOpen && attEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 85 }}>
          <div style={{ width: "min(860px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Attendance • {employees.find((x) => x.id === attEmpId)?.name || "Employee"} • {month}
              </div>
              <button
                onClick={() => { setAttOpen(false); setAttEmpId(null); setAttRows([]); }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            {attBusy && <div style={{ marginTop: 10, opacity: 0.75 }}>Loading…</div>}

            {!attBusy && (
              <div style={{ marginTop: 12, border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                  Any day that’s <b>not present</b> can deduct salary ((base + default bonus)/30 per day) unless you uncheck Deduct.
                </div>

                {/* Flight-style range picker */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, alignItems: "flex-start", width: "100%", maxWidth: "100%" }}>
                  <div style={{ border: "1px solid #30363d", borderRadius: 14, padding: 10, background: "#0f1623", flex: "0 0 320px", maxWidth: "100%" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 8, fontSize: 11, opacity: 0.8, textAlign: "center" }}>
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                      {(() => {
                        const pad = _firstDowMon(month);
                        const dim = _daysInMonth(month);
                        const cells: Array<number | null> = [];

                        for (let i = 0; i < pad; i++) cells.push(null);
                        for (let d = 1; d <= dim; d++) cells.push(d);
                        while (cells.length % 7 !== 0) cells.push(null);

                        const a = attPickStart;
                        const b = attPickEnd ?? attPickStart;
                        const r0 = a == null ? null : Math.min(a, b ?? a);
                        const r1 = a == null ? null : Math.max(a, b ?? a);

                        return cells.map((d, idx) => {
                          if (!d) return <div key={`x-${idx}`} style={{ height: 34 }} />;

                          const inRange = r0 != null && r1 != null && d >= r0 && d <= r1;
                          const isEdge = (r0 != null && d === r0) || (r1 != null && d === r1);

                          return (
                            <button
                              key={d}
                              onClick={() => {
                                if (attPickStart == null || (attPickStart != null && attPickEnd != null)) {
                                  setAttPickStart(d);
                                  setAttPickEnd(null);
                                  return;
                                }
                                // start set, end not set
                                if (d === attPickStart) {
                                  setAttPickEnd(d);
                                } else if (d < attPickStart) {
                                  setAttPickEnd(attPickStart);
                                  setAttPickStart(d);
                                } else {
                                  setAttPickEnd(d);
                                }
                              }}
                              style={{
                                height: 34,
                                borderRadius: 10,
                                border: isEdge ? "1px solid #1f6feb" : "1px solid #30363d",
                                background: inRange ? "#1f6feb" : "#0b0f17",
                                color: "#e6edf3",
                                fontWeight: isEdge ? 950 : 800,
                                cursor: "pointer",
                              }}
                              title={`${month}-${_pad2(d)}`}
                            >
                              {d}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div style={{ border: "1px solid #30363d", borderRadius: 14, padding: 10, background: "#0f1623", display: "grid", gap: 10, alignContent: "start", flex: "1 1 420px", minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Selected:{" "}
                      {attPickStart == null
                        ? "—"
                        : (() => {
                            const a = attPickStart;
                            const b = attPickEnd ?? attPickStart;
                            const s = Math.min(a, b);
                            const e = Math.max(a, b);
                            return `${month}-${_pad2(s)} → ${month}-${_pad2(e)}`;
                          })()}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0 }}>
                      <select
                        value={attBulkStatus}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAttBulkStatus(v);
                          setAttBulkDeduct(v === "present" ? false : true);
                        }}
                        style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", flex: "1 1 220px", minWidth: 200, maxWidth: "100%" }}
                      >
                        <option value="present">present</option>
                        <option value="absent">absent</option>
                        <option value="leave">leave</option>
                        <option value="sick">sick</option>
                      </select>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: attBulkStatus === "present" ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          checked={attBulkStatus === "present" ? false : attBulkDeduct}
                          disabled={attBulkStatus === "present"}
                          onChange={(e) => setAttBulkDeduct(e.target.checked)}
                        />
                        Deduct
                      </label>

                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginLeft: "auto" }}>
                        <button
                          onClick={() => {
                            setAttPickStart(null);
                            setAttPickEnd(null);
                          }}
                          style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}
                        >
                          Clear
                        </button>

                        <button
                          onClick={applyAttendanceRange}
                          disabled={attBulkBusy || attPickStart == null}
                          style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 950, opacity: attBulkBusy || attPickStart == null ? 0.7 : 1 }}
                        >
                          {attBulkBusy ? "Applying…" : "Apply range"}
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Tip: click a start day then an end day (like flight dates). Apply once.
                    </div>
                  </div>
                </div>

                <div style={{ maxHeight: 360, overflow: "auto" }}>

                  {Array.from({ length: _daysInMonth(month) }).map((_, i) => {
                    const dayNo = i + 1;
                    const day = `${month}-${String(dayNo).padStart(2, "0")}`;

                    const row = attRows.find((x) => x.day === day);
                    const status = (row?.status || "present").toLowerCase();
                    const deduct = status === "present" ? false : (row?.deduct ?? true);
                    const inEmp = attInEmployment(day);

                    return (
                      <div key={day} style={{ display: "grid", gridTemplateColumns: "120px 160px 140px 1fr", gap: 10, alignItems: "center", padding: "8px 6px", borderTop: "1px solid #121826" }}>
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas", fontSize: 12, opacity: 0.9 }}>{day}</div>

                        <select
                          value={status}
                          disabled={!inEmp}
                          onChange={(e) => {
                            if (!inEmp) return;
                            const next = e.target.value;
                            const nextDeduct = next === "present" ? false : (status === "present" ? true : deduct);
                            saveAttendance(day, next, nextDeduct);
                          }}
                          style={{ padding: 8, borderRadius: 12, border: "1px solid #30363d", background: "#0f1623", color: "#e6edf3" }}
                        >
                          <option value="present">present</option>
                          <option value="absent">absent</option>
                          <option value="leave">leave</option>
                          <option value="sick">sick</option>
                        </select>

                        <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: status === "present" ? 0.5 : 1 }}>
                          <input
                            type="checkbox"
                            checked={status === "present" ? false : deduct}
                            disabled={status === "present" || !inEmp}
                            onChange={(e) => {
                              if (!inEmp) return;
                              saveAttendance(day, status, e.target.checked);
                            }}
                          />
                          Deduct
                        </label>

                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row ? `saved` : `—`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payments modal */}
      {paymOpen && paymEmpId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 88 }}>
          <div style={{ width: "min(860px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                Payments • {employees.find((x) => x.id === paymEmpId)?.name || "Employee"} • {month}
              </div>
              <button
                onClick={() => { setPaymOpen(false); setPaymEmpId(null); setPaymRows([]); }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "200px 180px 1fr 140px", gap: 10, alignItems: "center" }}>
                <input
                  value={paymAmount}
                  onChange={(e) => setPaymAmount(e.target.value)}
                  placeholder={paymDue != null && paymDue > 0 ? `Due: ${fmtMoney(paymDue)}` : "Amount"}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis" }}
                />
                <input
                  value={paymDate}
                  onChange={(e) => setPaymDate(e.target.value)}
                  type="date"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                />
                <input
                  value={paymNote}
                  onChange={(e) => setPaymNote(e.target.value)}
                  placeholder="Note (optional)"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3" }}
                />
                <button
                  onClick={addPayment}
                  disabled={paymBusy}
                  style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900, opacity: paymBusy ? 0.7 : 1 }}
                >
                  {paymBusy ? "Saving…" : "Add"}
                </button>
              </div>

              <div style={{ border: "1px solid #30363d", borderRadius: 14, background: "#0b0f17", padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                  Payroll will subtract <b>sum(payments)</b> for this month automatically.
                </div>

                <div style={{ maxHeight: 360, overflow: "auto" }}>
                  {paymRows.length === 0 && <div style={{ opacity: 0.7 }}>No payments yet.</div>}

                  {paymRows.map((p) => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px 90px", gap: 10, padding: "8px 6px", borderTop: "1px solid #121826", alignItems: "center" }}>
                      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas", fontSize: 12 }}>{p.paid_on}</div>
                      <div style={{ opacity: 0.85, fontSize: 12 }}>{p.note || "—"}</div>
                      <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney(p.amount)}</div>
                      <button
                        onClick={() => deletePaymentRow(p.id)}
                        style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#ff7b72", fontWeight: 900 }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}

                  {paymRows.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", fontWeight: 950 }}>
                      Total: {fmtMoney(paymRows.reduce((s, x) => s + Number(x.amount || 0), 0))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Temp password modal */}
      {pwOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 14, zIndex: 90 }}>
          <div style={{ width: "min(640px, 96vw)", border: "1px solid #30363d", borderRadius: 16, background: "#0f1623", padding: 14 }}>
            <div style={{ fontWeight: 950 }}>{pwTitle}</div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              Login email: <b>{pwEmail || "-"}</b>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas", padding: "10px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17" }}>
                {pwValue || "(not returned)"}
              </div>
              <button onClick={() => pwValue && navigator.clipboard.writeText(pwValue)} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#1f6feb", color: "#e6edf3", fontWeight: 900 }}>
                Copy
              </button>
              <button onClick={() => { setPwOpen(false); setPwEmail(null); setPwValue(null); }} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #30363d", background: "#0b0f17", color: "#e6edf3", fontWeight: 900 }}>
                Done
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              User will be forced to set a new password on first login.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
