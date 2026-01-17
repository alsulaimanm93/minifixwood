from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    SupplierCreate, SupplierUpdate, SupplierOut,
    ItemCreate, ItemUpdate, ItemOut,
    StockLotReceive, StockLotOut, StockLotView,
    SheetLotCreate, SheetLotOut, SheetLotView, SheetReserveReq,
    ProjectRequirementUpsert, ProjectRequirementOut,
    ProjectAvailabilityRow,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


# -----------------------------
# Suppliers
# -----------------------------

@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT id, name, phone, email, address, notes, created_at, updated_at
        FROM suppliers
        ORDER BY name ASC
    """))
    return [SupplierOut(**r) for r in q.mappings().all()]


@router.post("/suppliers", response_model=SupplierOut)
async def create_supplier(req: SupplierCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(400, "Supplier name is required")

    q = await db.execute(text("""
        INSERT INTO suppliers (name, phone, email, address, notes, created_at, updated_at)
        VALUES (:name, :phone, :email, :address, :notes, now(), now())
        RETURNING id, name, phone, email, address, notes, created_at, updated_at
    """), {
        "name": name,
        "phone": req.phone,
        "email": req.email,
        "address": req.address,
        "notes": req.notes,
    })
    row = q.mappings().one()
    await db.commit()
    return SupplierOut(**row)

@router.put("/suppliers/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: UUID,
    req: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(400, "Supplier name is required")

    q = await db.execute(text("""
        UPDATE suppliers
        SET
          name=:name,
          phone=:phone,
          email=:email,
          address=:address,
          notes=:notes,
          updated_at=now()
        WHERE id=:id
        RETURNING id, name, phone, email, address, notes, created_at, updated_at
    """), {
        "id": str(supplier_id),
        "name": name,
        "phone": req.phone,
        "email": req.email,
        "address": req.address,
        "notes": req.notes,
    })

    row = q.mappings().first()
    if not row:
        raise HTTPException(404, "Supplier not found")

    await db.commit()
    return SupplierOut(**row)


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await db.execute(text("DELETE FROM suppliers WHERE id=:id"), {"id": str(supplier_id)})
    await db.commit()
    # rowcount is sometimes unreliable across drivers; returning ok regardless is fine
    return {"ok": True}

# -----------------------------
# Items (SKU catalog)
# -----------------------------

@router.get("/items", response_model=list[ItemOut])
async def list_items(type: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    where = "WHERE is_active=true"
    params: dict = {}
    if type:
        where += " AND type=:type"
        params["type"] = type

    q = await db.execute(text(f"""
        SELECT id, sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at
        FROM items
        {where}
        ORDER BY type ASC, name ASC
        LIMIT 500
    """), params)
    return [ItemOut(**r) for r in q.mappings().all()]


@router.get("/items/search", response_model=list[ItemOut])
async def search_items(q: str = "", limit: int = 30, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    term = (q or "").strip()
    if not term:
        return []
    lim = max(1, min(100, int(limit or 30)))
    like = f"%{term.lower()}%"
    res = await db.execute(text("""
        SELECT id, sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at
        FROM items
        WHERE is_active=true AND (
          lower(name) LIKE :like OR lower(sku) LIKE :like OR lower(coalesce(category,'')) LIKE :like
        )
        ORDER BY
          CASE WHEN lower(sku)=lower(:term) THEN 0 ELSE 1 END,
          CASE WHEN lower(name) LIKE lower(:term_prefix) THEN 0 ELSE 1 END,
          name ASC
        LIMIT :lim
    """), {"like": like, "lim": lim, "term": term, "term_prefix": f"{term.lower()}%"})
    return [ItemOut(**r) for r in res.mappings().all()]


@router.post("/items", response_model=ItemOut)
async def create_item(req: ItemCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sku = (req.sku or "").strip()
    name = (req.name or "").strip()
    itype = (req.type or "").strip().lower()
    if not sku or not name:
        raise HTTPException(400, "SKU and name are required")
    if itype not in {"sheet", "fitting", "appliance", "consumable"}:
        raise HTTPException(400, "Invalid type")

    q = await db.execute(text("""
        INSERT INTO items (sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at)
        VALUES (:sku, :name, :category, :type, :uom, :default_supplier_id, :min_stock, true, now(), now())
        RETURNING id, sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at
    """), {
        "sku": sku,
        "name": name,
        "category": req.category,
        "type": itype,
        "uom": req.uom or "pcs",
        "default_supplier_id": str(req.default_supplier_id) if req.default_supplier_id else None,
        "min_stock": req.min_stock,
    })
    row = q.mappings().one()
    await db.commit()
    return ItemOut(**row)
@router.put("/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: UUID, req: ItemUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sku = (req.sku or "").strip()
    name = (req.name or "").strip()
    itype = (req.type or "").strip().lower()

    if not sku or not name:
        raise HTTPException(400, "SKU and name are required")
    if itype not in {"sheet", "fitting", "appliance", "consumable"}:
        raise HTTPException(400, "Invalid type")

    q = await db.execute(text("""
        UPDATE items
        SET
          sku=:sku,
          name=:name,
          category=:category,
          type=:type,
          uom=:uom,
          default_supplier_id=:default_supplier_id,
          min_stock=:min_stock,
          is_active=:is_active,
          updated_at=now()
        WHERE id=:id
        RETURNING id, sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at
    """), {
        "id": str(item_id),
        "sku": sku,
        "name": name,
        "category": req.category,
        "type": itype,
        "uom": req.uom or "pcs",
        "default_supplier_id": str(req.default_supplier_id) if req.default_supplier_id else None,
        "min_stock": req.min_stock,
        "is_active": bool(req.is_active),
    })

    row = q.mappings().first()
    if not row:
        raise HTTPException(404, "Item not found")

    await db.commit()
    return ItemOut(**row)


@router.post("/items/{item_id}/deactivate", response_model=ItemOut)
async def deactivate_item(item_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        UPDATE items
        SET is_active=false, updated_at=now()
        WHERE id=:id
        RETURNING id, sku, name, category, type, uom, default_supplier_id, min_stock, is_active, created_at, updated_at
    """), {"id": str(item_id)})

    row = q.mappings().first()
    if not row:
        raise HTTPException(404, "Item not found")

    await db.commit()
    return ItemOut(**row)


# -----------------------------
# Stock (lots) - receive/list
# -----------------------------

@router.post("/stock/receive", response_model=StockLotOut)
async def receive_stock(req: StockLotReceive, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if req.qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    q = await db.execute(text("""
        INSERT INTO stock_lots (item_id, location, qty_on_hand, qty_reserved, unit_cost, source, ref, created_at, updated_at)
        VALUES (:item_id, :location, :qty, 0, :unit_cost, 'purchase', :ref, now(), now())
        RETURNING id, item_id, location, qty_on_hand, qty_reserved, unit_cost, source, ref, created_at, updated_at
    """), {
        "item_id": str(req.item_id),
        "location": req.location,
        "qty": req.qty,
        "unit_cost": req.unit_cost,
        "ref": req.ref,
    })
    row = q.mappings().one()
    await db.commit()
    return StockLotOut(**row)


@router.get("/stock", response_model=list[StockLotOut])
async def list_stock(item_id: UUID | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    where = ""
    params: dict = {}
    if item_id:
        where = "WHERE item_id=:item_id"
        params["item_id"] = str(item_id)

    q = await db.execute(text(f"""
        SELECT id, item_id, location, qty_on_hand, qty_reserved, unit_cost, source, ref, created_at, updated_at
        FROM stock_lots
        {where}
        ORDER BY created_at ASC
        LIMIT 500
    """), params)
    return [StockLotOut(**r) for r in q.mappings().all()]

@router.get("/stock/view", response_model=list[StockLotView])
async def list_stock_view(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT
          sl.id,
          sl.item_id,
          i.sku,
          i.name,
          i.type,
          i.uom,
          sl.location,
          sl.qty_on_hand::float8 as qty_on_hand,
          sl.qty_reserved::float8 as qty_reserved,
          sl.unit_cost,
          sl.source,
          sl.ref,
          sl.created_at,
          sl.updated_at
        FROM stock_lots sl
        JOIN items i ON i.id = sl.item_id
        ORDER BY sl.created_at DESC
        LIMIT 500
    """))
    return [StockLotView(**r) for r in q.mappings().all()]

# -----------------------------
# Sheets / Remnants (Phase 2 UI later)
# -----------------------------

@router.post("/sheets", response_model=SheetLotOut)
async def create_sheet_lot(req: SheetLotCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if req.w_mm <= 0 or req.h_mm <= 0:
        raise HTTPException(400, "Invalid sheet size")
    if req.qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    src = (req.source or "purchase").strip().lower()
    if src not in {"purchase", "remnant", "adjustment"}:
        raise HTTPException(400, "Invalid source")

    q = await db.execute(text("""
        INSERT INTO sheet_lots (
          material_item_id, thickness_mm, w_mm, h_mm, qty, usable,
          location, tag_code, project_origin_id, reserved_for_project_id,
          source, unit_cost, created_at, updated_at
        )
        VALUES (
          :material_item_id, :thickness_mm, :w_mm, :h_mm, :qty, :usable,
          :location, :tag_code, :project_origin_id, NULL,
          :source, :unit_cost, now(), now()
        )
        RETURNING
          id, material_item_id, thickness_mm, w_mm, h_mm, qty, usable,
          location, tag_code, project_origin_id, reserved_for_project_id,
          source, unit_cost, created_at, updated_at
    """), {
        "material_item_id": str(req.material_item_id),
        "thickness_mm": req.thickness_mm,
        "w_mm": req.w_mm,
        "h_mm": req.h_mm,
        "qty": req.qty,
        "usable": bool(req.usable),
        "location": req.location,
        "tag_code": req.tag_code,
        "project_origin_id": str(req.project_origin_id) if req.project_origin_id else None,
        "source": src,
        "unit_cost": req.unit_cost,
    })
    row = q.mappings().one()
    await db.commit()
    return SheetLotOut(**row)


@router.get("/sheets", response_model=list[SheetLotOut])
async def list_sheet_lots(material_item_id: UUID | None = None, only_available: bool = True, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    where = ["usable=true"]
    params: dict = {}
    if material_item_id:
        where.append("material_item_id=:mid")
        params["mid"] = str(material_item_id)
    if only_available:
        where.append("reserved_for_project_id IS NULL")

    w = " AND ".join(where)
    q = await db.execute(text(f"""
        SELECT
          id, material_item_id, thickness_mm, w_mm, h_mm, qty, usable,
          location, tag_code, project_origin_id, reserved_for_project_id,
          source, unit_cost, created_at, updated_at
        FROM sheet_lots
        WHERE {w}
        ORDER BY created_at DESC
        LIMIT 500
    """), params)
    return [SheetLotOut(**r) for r in q.mappings().all()]


# -----------------------------
# Project Requirements (BOM)
# -----------------------------

@router.get("/projects/{project_id}/requirements", response_model=list[ProjectRequirementOut])
async def list_requirements(project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT id, project_id, item_id, qty_required::float8 as qty_required, notes, source, updated_at
        FROM project_requirements
        WHERE project_id=:pid
        ORDER BY updated_at DESC
    """), {"pid": str(project_id)})
    return [ProjectRequirementOut(**r) for r in q.mappings().all()]


@router.post("/projects/{project_id}/requirements", response_model=ProjectRequirementOut)
async def upsert_requirement(project_id: UUID, req: ProjectRequirementUpsert, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if req.qty_required < 0:
        raise HTTPException(400, "qty_required must be >= 0")
    src = (req.source or "manual").strip().lower()
    if src not in {"manual", "import", "nesting", "template"}:
        raise HTTPException(400, "Invalid source")

    q = await db.execute(text("""
        INSERT INTO project_requirements (project_id, item_id, qty_required, notes, source, created_at, updated_at)
        VALUES (:pid, :item_id, :qty, :notes, :source, now(), now())
        ON CONFLICT (project_id, item_id)
        DO UPDATE SET qty_required=excluded.qty_required, notes=excluded.notes, source=excluded.source, updated_at=now()
        RETURNING id, project_id, item_id, qty_required::float8 as qty_required, notes, source, updated_at
    """), {
        "pid": str(project_id),
        "item_id": str(req.item_id),
        "qty": req.qty_required,
        "notes": req.notes,
        "source": src,
    })
    row = q.mappings().one()
    await db.commit()
    return ProjectRequirementOut(**row)


@router.delete("/projects/{project_id}/requirements/{item_id}")
async def delete_requirement(project_id: UUID, item_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await db.execute(text("""
        DELETE FROM project_requirements
        WHERE project_id=:pid AND item_id=:iid
    """), {"pid": str(project_id), "iid": str(item_id)})
    await db.commit()
    return {"ok": True}


# -----------------------------
# Availability (per project) => what to buy
# -----------------------------

@router.get("/projects/{project_id}/availability", response_model=list[ProjectAvailabilityRow])
async def project_availability(project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        WITH req AS (
          SELECT pr.item_id, pr.qty_required
          FROM project_requirements pr
          WHERE pr.project_id = :pid
        ), stock AS (
          SELECT sl.item_id,
                 COALESCE(SUM(sl.qty_on_hand),0) AS on_hand,
                 COALESCE(SUM(sl.qty_reserved),0) AS reserved_total
          FROM stock_lots sl
          GROUP BY sl.item_id
        )
        SELECT
          i.id AS item_id,
          i.sku,
          i.name,
          i.type,
          i.uom,
          COALESCE(req.qty_required,0)::float8 AS qty_required,
          COALESCE(stock.on_hand,0)::float8 AS qty_on_hand,
          COALESCE(stock.reserved_total,0)::float8 AS qty_reserved_total,
          (COALESCE(stock.on_hand,0) - COALESCE(stock.reserved_total,0))::float8 AS qty_available_net,
          GREATEST(COALESCE(req.qty_required,0) - (COALESCE(stock.on_hand,0) - COALESCE(stock.reserved_total,0)), 0)::float8 AS qty_to_buy
        FROM req
        JOIN items i ON i.id = req.item_id
        LEFT JOIN stock ON stock.item_id = i.id
        ORDER BY i.type ASC, i.name ASC
    """), {"pid": str(project_id)})

    return [ProjectAvailabilityRow(**r) for r in q.mappings().all()]
@router.get("/sheets/view", response_model=list[SheetLotView])
async def list_sheet_lots_view(
    material_item_id: UUID | None = None,
    only_available: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    where = ["sl.usable=true"]
    params: dict = {}
    if material_item_id:
        where.append("sl.material_item_id=:mid")
        params["mid"] = str(material_item_id)
    if only_available:
        where.append("sl.reserved_for_project_id IS NULL")

    w = " AND ".join(where)
    q = await db.execute(text(f"""
        SELECT
          sl.id,
          sl.material_item_id,
          i.sku as material_sku,
          i.name as material_name,
          sl.thickness_mm,
          sl.w_mm,
          sl.h_mm,
          sl.qty,
          sl.usable,
          sl.location,
          sl.tag_code,
          sl.project_origin_id,
          sl.reserved_for_project_id,
          sl.source,
          sl.unit_cost,
          sl.created_at,
          sl.updated_at
        FROM sheet_lots sl
        JOIN items i ON i.id = sl.material_item_id
        WHERE {w}
        ORDER BY sl.created_at DESC
        LIMIT 500
    """), params)

    return [SheetLotView(**r) for r in q.mappings().all()]


@router.put("/sheets/{sheet_id}/reserve", response_model=SheetLotOut)
async def reserve_sheet(sheet_id: UUID, req: SheetReserveReq, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        UPDATE sheet_lots
        SET reserved_for_project_id=:pid, updated_at=now()
        WHERE id=:id
        RETURNING
          id, material_item_id, thickness_mm, w_mm, h_mm, qty, usable,
          location, tag_code, project_origin_id, reserved_for_project_id,
          source, unit_cost, created_at, updated_at
    """), {"id": str(sheet_id), "pid": str(req.project_id)})

    row = q.mappings().first()
    if not row:
        raise HTTPException(404, "Sheet lot not found")
    await db.commit()
    return SheetLotOut(**row)


@router.put("/sheets/{sheet_id}/unreserve", response_model=SheetLotOut)
async def unreserve_sheet(sheet_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        UPDATE sheet_lots
        SET reserved_for_project_id=NULL, updated_at=now()
        WHERE id=:id
        RETURNING
          id, material_item_id, thickness_mm, w_mm, h_mm, qty, usable,
          location, tag_code, project_origin_id, reserved_for_project_id,
          source, unit_cost, created_at, updated_at
    """), {"id": str(sheet_id)})

    row = q.mappings().first()
    if not row:
        raise HTTPException(404, "Sheet lot not found")
    await db.commit()
    return SheetLotOut(**row)
