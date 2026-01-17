-- INVENTORY (high-end, lot-based) + project-driven requirements

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure projects table matches current models (safe no-op if already applied)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS max_days_to_finish int,
  ADD COLUMN IF NOT EXISTS inventory_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_items text,
  ADD COLUMN IF NOT EXISTS inventory_notes text;

-- SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ITEM CATALOG (SKU master)
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  type text NOT NULL CHECK (type IN ('sheet','fitting','appliance','consumable')),
  uom text NOT NULL DEFAULT 'pcs',
  default_supplier_id uuid REFERENCES suppliers(id),
  min_stock numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS items_type_idx ON items(type);

-- STOCK LOTS (for fittings/appliances/consumables)
CREATE TABLE IF NOT EXISTS stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id),
  location text,
  qty_on_hand numeric NOT NULL DEFAULT 0,
  qty_reserved numeric NOT NULL DEFAULT 0,
  unit_cost numeric,
  source text NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase','adjustment','return')),
  ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_lots_item_idx ON stock_lots(item_id);

-- SHEET / REMNANT LOTS (dimension-aware)
CREATE TABLE IF NOT EXISTS sheet_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_item_id uuid NOT NULL REFERENCES items(id),
  thickness_mm int,
  w_mm int NOT NULL,
  h_mm int NOT NULL,
  qty int NOT NULL DEFAULT 1,
  usable boolean NOT NULL DEFAULT true,
  location text,
  tag_code text,
  project_origin_id uuid REFERENCES projects(id),
  reserved_for_project_id uuid REFERENCES projects(id),
  source text NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase','remnant','adjustment')),
  unit_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sheet_lots_material_idx ON sheet_lots(material_item_id);
CREATE INDEX IF NOT EXISTS sheet_lots_reserved_idx ON sheet_lots(reserved_for_project_id);

-- PROJECT REQUIREMENTS (project-driven BOM)
CREATE TABLE IF NOT EXISTS project_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  qty_required numeric NOT NULL DEFAULT 0,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','nesting','template')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, item_id)
);

CREATE INDEX IF NOT EXISTS project_requirements_project_idx ON project_requirements(project_id);

-- RESERVATIONS (Phase 2 use; ready now)
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  stock_lot_id uuid REFERENCES stock_lots(id) ON DELETE CASCADE,
  sheet_lot_id uuid REFERENCES sheet_lots(id) ON DELETE CASCADE,
  qty_reserved numeric NOT NULL DEFAULT 0,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  note text,
  CHECK (
    (stock_lot_id IS NOT NULL AND sheet_lot_id IS NULL)
    OR
    (stock_lot_id IS NULL AND sheet_lot_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS reservations_project_idx ON reservations(project_id);
CREATE INDEX IF NOT EXISTS reservations_item_idx ON reservations(item_id);

-- PURCHASE ORDERS (starter)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_received','received','canceled')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric,
  notes text
);

CREATE INDEX IF NOT EXISTS po_lines_po_idx ON purchase_order_lines(po_id);
