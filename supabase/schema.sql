-- Tillaroo POS — Supabase (Postgres) Schema
-- This is the cloud database. Registers sync their local SQLite data here.
-- Run this in the Supabase SQL Editor after creating your project.

-- ─── Products ───────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  colour      TEXT DEFAULT '#4fbd77',
  family      TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  barcode     TEXT,
  plu         TEXT,
  name        TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price  NUMERIC(10,2) DEFAULT 0,
  unit        TEXT DEFAULT 'each',
  tax_rate    NUMERIC(4,2) DEFAULT 0.10,
  track_stock BOOLEAN DEFAULT false,
  stock_qty   NUMERIC(10,2) DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  image_url   TEXT,
  open_price  BOOLEAN DEFAULT false,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_plu ON products(plu);
CREATE INDEX idx_products_category ON products(category_id);
CREATE UNIQUE INDEX idx_products_plu_unique ON products(plu) WHERE plu IS NOT NULL AND plu <> '';
CREATE UNIQUE INDEX idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- ─── Specials & Deals ───────────────────────────────────────────────────────

CREATE TABLE specials (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  special_price NUMERIC(10,2) NOT NULL,
  start_date    DATE,
  end_date      DATE,
  active        BOOLEAN DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deals (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  start_date  DATE,
  end_date    DATE,
  active      BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deal_products (
  deal_id    TEXT NOT NULL REFERENCES deals(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  role       TEXT DEFAULT 'trigger',
  PRIMARY KEY (deal_id, product_id)
);

-- ─── Staff ──────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  role        TEXT DEFAULT 'cashier',
  active      BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Transactions ───────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id            TEXT PRIMARY KEY,
  register_id   TEXT NOT NULL,
  staff_id      TEXT REFERENCES staff(id),
  customer_name TEXT,
  subtotal      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax           NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT DEFAULT 'completed',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE transaction_items (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  product_id      TEXT REFERENCES products(id),
  name            TEXT NOT NULL,
  qty             NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL,
  discount        NUMERIC(10,2) DEFAULT 0,
  line_total      NUMERIC(10,2) NOT NULL,
  tax             NUMERIC(10,2) DEFAULT 0,
  deal_id         TEXT REFERENCES deals(id)
);

CREATE TABLE payments (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  method          TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  reference       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Cash Management ────────────────────────────────────────────────────────

CREATE TABLE cash_drawer (
  id          TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  staff_id    TEXT REFERENCES staff(id),
  action      TEXT NOT NULL,
  amount      NUMERIC(10,2),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Reporting Views ────────────────────────────────────────────────────────

CREATE VIEW daily_sales AS
SELECT
  DATE(created_at) AS sale_date,
  register_id,
  COUNT(*) AS txn_count,
  SUM(total) AS total_sales,
  SUM(tax) AS total_tax,
  SUM(discount) AS total_discounts
FROM transactions
WHERE status = 'completed'
GROUP BY DATE(created_at), register_id;

CREATE VIEW product_sales AS
SELECT
  ti.product_id,
  p.name,
  p.category_id,
  SUM(ti.qty) AS total_qty,
  SUM(ti.line_total) AS total_revenue,
  COUNT(DISTINCT ti.transaction_id) AS txn_count
FROM transaction_items ti
JOIN products p ON p.id = ti.product_id
JOIN transactions t ON t.id = ti.transaction_id
WHERE t.status = 'completed'
GROUP BY ti.product_id, p.name, p.category_id;

-- ─── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE specials ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON specials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON deal_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON transaction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON cash_drawer FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert" ON transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert" ON transaction_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert" ON payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert" ON cash_drawer FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can manage products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage specials" ON specials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage deals" ON deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage deal_products" ON deal_products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage staff" ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Keyboard Layout ───────────────────────────────────────────────────────

CREATE TABLE keyboard_buttons (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL,
  price           NUMERIC(10,2) DEFAULT 0,
  image           TEXT,
  image_scale     NUMERIC(6,2) DEFAULT 100,
  color           TEXT DEFAULT '#fff',
  bg_color        TEXT DEFAULT '#1a3d2a',
  parent_id       TEXT,
  category_filter TEXT,
  alpha_range     TEXT,
  sort_order      INT DEFAULT 0,
  position        TEXT DEFAULT 'main',
  page            INT DEFAULT 1,
  grid_row        INT DEFAULT 0,
  grid_col        INT DEFAULT 0,
  col_span        INT DEFAULT 1,
  row_span        INT DEFAULT 1,
  product_id      TEXT REFERENCES products(id),
  active          BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE keyboard_buttons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all" ON keyboard_buttons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage keyboard" ON keyboard_buttons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE keyboard_pages (
  page       INT PRIMARY KEY,
  name       TEXT DEFAULT 'Untitled',
  cols       INT DEFAULT 13,
  rows       INT DEFAULT 7,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE keyboard_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all" ON keyboard_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage keyboard pages" ON keyboard_pages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Settings ──────────────────────────────────────────────────────────────

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage settings" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Enable realtime on tables that registers need to watch for updates

ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE specials;
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE deal_products;
ALTER PUBLICATION supabase_realtime ADD TABLE keyboard_buttons;
ALTER PUBLICATION supabase_realtime ADD TABLE keyboard_pages;
ALTER PUBLICATION supabase_realtime ADD TABLE staff;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;
