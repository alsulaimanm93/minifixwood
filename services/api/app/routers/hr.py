import re
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_roles
from ..models import Employee, Salary, Loan, Attendance, SalaryPayment

router = APIRouter(prefix="/hr", tags=["hr"])

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def _now():
    return datetime.now(timezone.utc)


def _money(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


# -----------------------
# Employees
# -----------------------
class EmployeeCreate(BaseModel):
    name: str
    department: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    hire_date: Optional[date] = None
    base_salary: Optional[float] = None
    default_bonus: Optional[float] = None
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    hire_date: Optional[date] = None
    base_salary: Optional[float] = None
    default_bonus: Optional[float] = None
    is_active: Optional[bool] = None


class EmployeeOut(BaseModel):
    id: str
    name: str
    department: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    hire_date: Optional[date] = None
    base_salary: Optional[float] = None
    default_bonus: Optional[float] = None
    is_active: bool


@router.get("/employees", response_model=List[EmployeeOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_employees(db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Employee).order_by(Employee.created_at.desc()))
    rows = q.scalars().all()
    return [
        EmployeeOut(
            id=str(x.id),
            name=x.name,
            department=x.department,
            position=x.position,
            phone=x.phone,
            email=x.email,
            hire_date=x.hire_date,
            base_salary=_money(x.base_salary),
            default_bonus=_money(getattr(x, "default_bonus", None)),
            is_active=bool(x.is_active),
        )
        for x in rows
    ]


@router.post("/employees", response_model=EmployeeOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    now = _now()
    emp = Employee(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        department=(payload.department.strip() if payload.department else None),
        position=(payload.position.strip() if payload.position else None),
        phone=(payload.phone.strip() if payload.phone else None),
        email=(payload.email.strip().lower() if payload.email else None),
        hire_date=payload.hire_date,
        base_salary=payload.base_salary,
        default_bonus=payload.default_bonus,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(emp)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Employee email already exists")
    await db.refresh(emp)
    return EmployeeOut(
        id=str(emp.id),
        name=emp.name,
        department=emp.department,
        position=emp.position,
        phone=emp.phone,
        email=emp.email,
        hire_date=emp.hire_date,
        base_salary=_money(emp.base_salary),
        default_bonus=_money(getattr(emp, "default_bonus", None)),
        is_active=bool(emp.is_active),
    )


@router.patch("/employees/{employee_id}", response_model=EmployeeOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def update_employee(employee_id: str, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db)):
    try:
        eid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == eid))
    emp = q.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if payload.name is not None:
        emp.name = payload.name.strip()
    if payload.department is not None:
        emp.department = payload.department.strip() if payload.department else None
    if payload.position is not None:
        emp.position = payload.position.strip() if payload.position else None
    if payload.phone is not None:
        emp.phone = payload.phone.strip() if payload.phone else None
    if payload.email is not None:
        emp.email = payload.email.strip().lower() if payload.email else None
    if payload.hire_date is not None:
        emp.hire_date = payload.hire_date
    if payload.base_salary is not None:
        emp.base_salary = payload.base_salary
    if payload.default_bonus is not None:
        emp.default_bonus = payload.default_bonus
    if payload.is_active is not None:
        emp.is_active = payload.is_active

    emp.updated_at = _now()
    await db.commit()
    await db.refresh(emp)

    return EmployeeOut(
        id=str(emp.id),
        name=emp.name,
        department=emp.department,
        position=emp.position,
        phone=emp.phone,
        email=emp.email,
        hire_date=emp.hire_date,
        base_salary=_money(emp.base_salary),
        is_active=bool(emp.is_active),
    )


@router.delete("/employees/{employee_id}", dependencies=[Depends(require_roles("admin", "hr"))])
async def delete_employee(employee_id: str, db: AsyncSession = Depends(get_db)):
    try:
        eid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == eid))
    emp = q.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # hard-delete related HR rows (avoid FK issues if cascade isn't enabled)
    await db.execute(delete(Salary).where(Salary.employee_id == eid))
    await db.execute(delete(Attendance).where(Attendance.employee_id == eid))
    await db.execute(delete(SalaryPayment).where(SalaryPayment.employee_id == eid))
    await db.execute(delete(Loan).where(Loan.employee_id == eid))
    await db.execute(delete(Employee).where(Employee.id == eid))

    await db.commit()
    return {"ok": True}


# -----------------------
# Salaries (PAYROLL) — saved per month, per employee (upsert)
# Formula: hourly = basic / 30 / 8
# Auto-loans: deduct monthly_deduction capped by remaining
# (Idempotent-ish: only auto-deduct loans if this month row had no loan_deduction yet)
# -----------------------
class SalaryCreate(BaseModel):
    employee_id: str
    month: str = Field(..., description="YYYY-MM")

    # components
    bonuses: Optional[float] = 0.0
    overtime_hours: Optional[float] = 0.0
    manual_deductions: Optional[float] = 0.0
    already_paid: Optional[float] = 0.0

    # loan control
    loan_override: Optional[float] = None  # if set, use this as the monthly loan deduction
    apply_loans: bool = True               # keep True; auto applies once per month

    status: Optional[str] = "draft"


class SalaryOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    month: str

    gross: Optional[float] = None
    deductions: Optional[float] = None
    net: Optional[float] = None
    status: str
    paid_on: Optional[date] = None

    # breakdown
    bonuses: Optional[float] = None
    overtime_hours: Optional[float] = None
    hourly_rate: Optional[float] = None
    overtime_pay: Optional[float] = None

    manual_deductions: Optional[float] = None
    already_paid: Optional[float] = None

    loan_deduction: Optional[float] = None
    loan_override: Optional[float] = None

@router.get("/salaries", response_model=List[SalaryOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_salaries(db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(Salary, Employee.name)
        .join(Employee, Employee.id == Salary.employee_id)
        .order_by(Salary.created_at.desc())
    )
    rows = q.all()
    out: List[SalaryOut] = []
    for sal, emp_name in rows:
        out.append(
            SalaryOut(
                id=str(sal.id),
                employee_id=str(sal.employee_id),
                employee_name=emp_name,
                month=sal.month,
                gross=_money(sal.gross),
                deductions=_money(sal.deductions),
                net=_money(sal.net),
                status=sal.status,
                paid_on=sal.paid_on,
                overtime_hours=_money(getattr(sal, "overtime_hours", None)),
                hourly_rate=_money(getattr(sal, "hourly_rate", None)),
                overtime_pay=_money(getattr(sal, "overtime_pay", None)),
                bonuses=_money(getattr(sal, "bonuses", None)),
                manual_deductions=_money(getattr(sal, "manual_deductions", None)),
                already_paid=_money(getattr(sal, "already_paid", None)),
                loan_override=_money(getattr(sal, "loan_override", None)),

                loan_deduction=_money(getattr(sal, "loan_deduction", None)),
            )
        )
    return out


@router.post("/salaries", response_model=SalaryOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def upsert_salary(payload: SalaryCreate, db: AsyncSession = Depends(get_db)):
    month = payload.month.strip()
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    try:
        emp_id = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = q.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=400, detail="Employee not found")

    base = float(emp.base_salary or 0.0)
    hourly = (base / 30.0 / 8.0) if base > 0 else 0.0

    bonuses = float(payload.bonuses or 0.0)
    ot_hours = float(payload.overtime_hours or 0.0)
    ot_pay = hourly * ot_hours

    manual_ded = float(payload.manual_deductions or 0.0)
    already_paid = 0.0  # derived from salary_payments (computed below)

    # find existing salary row for this employee+month
    qs = await db.execute(select(Salary).where(Salary.employee_id == emp.id, Salary.month == month))
    existing = qs.scalar_one_or_none()

    # Apply loans only once per employee/month to avoid double-deduct on edits
    should_apply_loans = bool(payload.apply_loans) and (
        existing is None or float(existing.loan_deduction or 0.0) == 0.0
    )

    # Decide requested loan for this month:
    # - if loan_override is provided -> use it
    # - else -> auto from open loans monthly_deduction (capped by remaining)
    requested_loan = None
    if payload.loan_override is not None:
        requested_loan = float(payload.loan_override)
        if requested_loan < 0:
            raise HTTPException(status_code=400, detail="loan_override must be >= 0")

    loan_deduct = 0.0

    if should_apply_loans:
        ql = await db.execute(
            select(Loan)
            .where(Loan.employee_id == emp.id, Loan.status != "closed")
            .order_by(Loan.created_at.asc())
        )
        open_loans = ql.scalars().all()

        if requested_loan is None:
            # auto: sum monthly_deduction capped by remaining
            for ln in open_loans:
                rem = float(ln.remaining or 0.0)
                if rem <= 0:
                    ln.remaining = 0
                    ln.status = "closed"
                    ln.updated_at = _now()
                    continue

                md = float(ln.monthly_deduction or 0.0)
                if md <= 0:
                    continue

                take = md if rem >= md else rem
                ln.remaining = rem - take
                if float(ln.remaining or 0.0) <= 0:
                    ln.remaining = 0
                    ln.status = "closed"
                ln.updated_at = _now()
                loan_deduct += take
        else:
            # override: deduct requested_loan across loans in order (capped by remaining)
            remaining_to_take = requested_loan
            for ln in open_loans:
                if remaining_to_take <= 0:
                    break
                rem = float(ln.remaining or 0.0)
                if rem <= 0:
                    ln.remaining = 0
                    ln.status = "closed"
                    ln.updated_at = _now()
                    continue

                take = rem if rem <= remaining_to_take else remaining_to_take
                ln.remaining = rem - take
                if float(ln.remaining or 0.0) <= 0:
                    ln.remaining = 0
                    ln.status = "closed"
                ln.updated_at = _now()
                loan_deduct += take
                remaining_to_take -= take

    # loan_deduct is what we actually apply to loan balances (only when should_apply_loans=True).
    # If editing an existing month row, don't touch balances again — just reuse stored value
    # (or the override, if provided) for salary math.
    loan_used_for_salary = loan_deduct

    if not should_apply_loans:
        if requested_loan is not None:
            # explicit override always wins
            loan_used_for_salary = requested_loan
        elif existing is not None:
            # If loans were deleted after this salary row was created,
            # don't keep a stale monthly loan deduction forever.
            qcheck = await db.execute(
                select(Loan).where(Loan.employee_id == emp.id, Loan.status != "closed")
            )
            has_open_loans = qcheck.scalar_one_or_none() is not None

            loan_used_for_salary = float(existing.loan_deduction or 0.0)
            if not has_open_loans:
                loan_used_for_salary = 0.0

    default_bonus = float(getattr(emp, "default_bonus", 0.0) or 0.0)
    # attendance: absent days deduction ((base + default_bonus)/30 per day)
    y, m = month.split("-")
    y = int(y); m = int(m)
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    qa = await db.execute(
        select(Attendance).where(
            Attendance.employee_id == emp.id,
            Attendance.day >= start,
            Attendance.day < end,
            Attendance.status == "absent",
            Attendance.deduct == True,
        )
    )
    absent_days = len(qa.scalars().all())
    absence_deduction = ((base + default_bonus) / 30.0) * float(absent_days)

    # payments: sum of partial payments for this month
    qp = await db.execute(
        select(SalaryPayment).where(
            SalaryPayment.employee_id == emp.id,
            SalaryPayment.month == month,
        )
    )
    payments_total = sum(float(x.amount) for x in qp.scalars().all())
    already_paid = payments_total

    gross = base + default_bonus + bonuses + ot_pay

    # "deductions" is ONLY: attendance(absence) + manual payroll deductions
    deductions = manual_ded + absence_deduction

    total_deductions = deductions + loan_used_for_salary + already_paid
    net = gross - total_deductions



    now = _now()
    status = (payload.status or "draft").strip() if payload.status else "draft"

    if existing:
        existing.gross = gross
        existing.deductions = deductions
        existing.net = net
        existing.status = status
        existing.overtime_hours = ot_hours
        existing.hourly_rate = hourly
        existing.overtime_pay = ot_pay
        # store the actual amount used in salary math for this month
        existing.loan_deduction = loan_used_for_salary
        existing.updated_at = now
        existing.bonuses = bonuses
        existing.manual_deductions = manual_ded
        existing.already_paid = already_paid
        existing.loan_override = requested_loan
        sal = existing
    else:
        sal = Salary(
            id=uuid.uuid4(),
            employee_id=emp.id,
            month=month,
            gross=gross,
            deductions=deductions,
            net=net,
            status=status,
            paid_on=None,
            overtime_hours=ot_hours,
            hourly_rate=hourly,
            overtime_pay=ot_pay,
            loan_deduction=loan_used_for_salary,
            bonuses=bonuses,
            manual_deductions=manual_ded,
            already_paid=already_paid,
            loan_override=requested_loan,
            created_at=now,
            updated_at=now,
        )
        db.add(sal)

    await db.commit()
    await db.refresh(sal)

    return SalaryOut(
        id=str(sal.id),
        employee_id=str(sal.employee_id),
        employee_name=emp.name,
        month=sal.month,
        gross=_money(sal.gross),
        deductions=_money(sal.deductions),
        net=_money(sal.net),
        status=sal.status,
        paid_on=sal.paid_on,
        overtime_hours=_money(getattr(sal, "overtime_hours", None)),
        hourly_rate=_money(getattr(sal, "hourly_rate", None)),
        overtime_pay=_money(getattr(sal, "overtime_pay", None)),
        loan_deduction=_money(getattr(sal, "loan_deduction", None)),
        bonuses=_money(getattr(sal, "bonuses", None)),
        manual_deductions=_money(getattr(sal, "manual_deductions", None)),
        already_paid=_money(getattr(sal, "already_paid", None)),
        loan_override=_money(getattr(sal, "loan_override", None)),

    )


# -----------------------
# Loans
# -----------------------
class LoanCreate(BaseModel):
    employee_id: str
    principal: float
    monthly_deduction: Optional[float] = None


class LoanOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    principal: Optional[float] = None
    remaining: Optional[float] = None
    monthly_deduction: Optional[float] = None
    status: str
    created_at: Optional[datetime] = None


@router.get("/loans", response_model=List[LoanOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_loans(db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(Loan, Employee.name)
        .join(Employee, Employee.id == Loan.employee_id)
        .order_by(Loan.created_at.desc())
    )
    rows = q.all()
    out: List[LoanOut] = []
    for ln, emp_name in rows:
        out.append(
            LoanOut(
                id=str(ln.id),
                employee_id=str(ln.employee_id),
                employee_name=emp_name,
                principal=_money(ln.principal),
                remaining=_money(ln.remaining),
                monthly_deduction=_money(ln.monthly_deduction),
                status=ln.status,
                created_at=ln.created_at,
            )
        )
    return out


@router.post("/loans", response_model=LoanOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def create_loan(payload: LoanCreate, db: AsyncSession = Depends(get_db)):
    try:
        emp_id = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = q.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=400, detail="Employee not found")

    principal = float(payload.principal)
    if principal <= 0:
        raise HTTPException(status_code=400, detail="principal must be > 0")

    now = _now()
    ln = Loan(
        id=uuid.uuid4(),
        employee_id=emp.id,
        principal=principal,
        remaining=principal,
        monthly_deduction=payload.monthly_deduction,
        status="open",
        created_at=now,
        updated_at=now,
    )
    db.add(ln)
    await db.commit()
    await db.refresh(ln)

    return LoanOut(
        id=str(ln.id),
        employee_id=str(ln.employee_id),
        employee_name=emp.name,
        principal=_money(ln.principal),
        remaining=_money(ln.remaining),
        monthly_deduction=_money(ln.monthly_deduction),
        status=ln.status,
        created_at=ln.created_at,
    )


@router.delete("/loans/{loan_id}", dependencies=[Depends(require_roles("admin", "hr"))])
async def delete_loan(loan_id: str, db: AsyncSession = Depends(get_db)):
    try:
        lid = uuid.UUID(loan_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid loan_id")

    q = await db.execute(select(Loan).where(Loan.id == lid))
    ln = q.scalar_one_or_none()
    if not ln:
        raise HTTPException(status_code=404, detail="Loan not found")

    await db.execute(delete(Loan).where(Loan.id == lid))
    await db.commit()
    return {"ok": True}
# -----------------------
# Attendance (daily)
# -----------------------
class AttendanceUpsert(BaseModel):
    employee_id: str
    day: date
    status: str = "present"   # present | absent | leave | sick
    deduct: bool = True
    note: Optional[str] = None

class AttendanceOut(BaseModel):
    id: str
    employee_id: str
    day: date
    status: str
    deduct: bool
    note: Optional[str] = None

@router.get("/attendance", response_model=List[AttendanceOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_attendance(month: str, employee_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    if not MONTH_RE.match(month.strip()):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    y, m = month.strip().split("-")
    y = int(y); m = int(m)
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    stmt = select(Attendance).where(Attendance.day >= start, Attendance.day < end)
    if employee_id:
        try:
            eid = uuid.UUID(employee_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid employee_id")
        stmt = stmt.where(Attendance.employee_id == eid)

    q = await db.execute(stmt.order_by(Attendance.day.asc()))
    rows = q.scalars().all()
    return [
        AttendanceOut(
            id=str(x.id),
            employee_id=str(x.employee_id),
            day=x.day,
            status=x.status,
            deduct=bool(x.deduct),
            note=x.note,
        )
        for x in rows
    ]

@router.post("/attendance", response_model=AttendanceOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def upsert_attendance(payload: AttendanceUpsert, db: AsyncSession = Depends(get_db)):
    try:
        eid = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == eid))
    if not q.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee not found")

    qs = await db.execute(select(Attendance).where(Attendance.employee_id == eid, Attendance.day == payload.day))
    existing = qs.scalar_one_or_none()

    now = _now()
    if existing:
        existing.status = (payload.status or "present").strip().lower()
        existing.deduct = bool(payload.deduct)
        existing.note = payload.note
        existing.updated_at = now
        row = existing
    else:
        row = Attendance(
            id=uuid.uuid4(),
            employee_id=eid,
            day=payload.day,
            status=(payload.status or "present").strip().lower(),
            deduct=bool(payload.deduct),
            note=payload.note,
            created_at=now,
            updated_at=now,
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)

    return AttendanceOut(
        id=str(row.id),
        employee_id=str(row.employee_id),
        day=row.day,
        status=row.status,
        deduct=bool(row.deduct),
        note=row.note,
    )
# -----------------------
# Payments (multiple per month)
# -----------------------
class PaymentCreate(BaseModel):
    employee_id: str
    month: str = Field(..., description="YYYY-MM")
    amount: float
    paid_on: date
    note: Optional[str] = None

class PaymentOut(BaseModel):
    id: str
    employee_id: str
    month: str
    amount: float
    paid_on: date
    note: Optional[str] = None

@router.get("/payments", response_model=List[PaymentOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_payments(month: str, employee_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    if not MONTH_RE.match(month.strip()):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    stmt = select(SalaryPayment).where(SalaryPayment.month == month.strip())
    if employee_id:
        try:
            eid = uuid.UUID(employee_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid employee_id")
        stmt = stmt.where(SalaryPayment.employee_id == eid)

    q = await db.execute(stmt.order_by(SalaryPayment.paid_on.asc()))
    rows = q.scalars().all()
    return [
        PaymentOut(
            id=str(x.id),
            employee_id=str(x.employee_id),
            month=x.month,
            amount=float(x.amount),
            paid_on=x.paid_on,
            note=x.note,
        )
        for x in rows
    ]

@router.post("/payments", response_model=PaymentOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def create_payment(payload: PaymentCreate, db: AsyncSession = Depends(get_db)):
    if not MONTH_RE.match(payload.month.strip()):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    if float(payload.amount) <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")

    try:
        eid = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == eid))
    if not q.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee not found")

    now = _now()
    row = SalaryPayment(
        id=uuid.uuid4(),
        employee_id=eid,
        month=payload.month.strip(),
        amount=float(payload.amount),
        paid_on=payload.paid_on,
        note=payload.note,
        created_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return PaymentOut(
        id=str(row.id),
        employee_id=str(row.employee_id),
        month=row.month,
        amount=float(row.amount),
        paid_on=row.paid_on,
        note=row.note,
    )


@router.delete("/payments/{payment_id}", dependencies=[Depends(require_roles("admin", "hr"))])
async def delete_payment(payment_id: str, db: AsyncSession = Depends(get_db)):
    try:
        pid = uuid.UUID(payment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payment_id")

    q = await db.execute(select(SalaryPayment).where(SalaryPayment.id == pid))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")

    await db.execute(delete(SalaryPayment).where(SalaryPayment.id == pid))
    await db.commit()
    return {"ok": True}
