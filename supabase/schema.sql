-- YieldPOS Supabase schema
-- Cloud mirror for the local SQLite database. The shop's live SQLite database
-- remains the source of truth; Supabase is used for backup/sync.

DROP VIEW IF EXISTS public.product_sales CASCADE;
DROP VIEW IF EXISTS public.daily_sales CASCADE;

DROP TABLE IF EXISTS public.transaction_items CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.cash_drawer CASCADE;
DROP TABLE IF EXISTS public.deal_products CASCADE;
DROP TABLE IF EXISTS public.specials CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.keyboard_buttons CASCADE;
DROP TABLE IF EXISTS public.keyboard_pages CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.deleted_records CASCADE;

CREATE TABLE public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  colour TEXT DEFAULT '#4fbd77',
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  family TEXT DEFAULT ''
);

CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  barcode TEXT,
  plu TEXT,
  name TEXT NOT NULL,
  category_id TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12, 2) DEFAULT 0,
  unit TEXT DEFAULT 'each',
  tax_rate NUMERIC(6, 4) DEFAULT 0.10,
  track_stock BOOLEAN DEFAULT false,
  stock_qty NUMERIC(12, 3) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  image_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  open_price BOOLEAN DEFAULT false
);

CREATE TABLE public.specials (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  special_price NUMERIC(12, 2) NOT NULL,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deal_products (
  deal_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  role TEXT DEFAULT 'trigger',
  PRIMARY KEY (deal_id, product_id)
);

CREATE TABLE public.staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.transactions (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  staff_id TEXT,
  customer_name TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  discount NUMERIC(12, 2) DEFAULT 0,
  line_total NUMERIC(12, 2) NOT NULL,
  tax NUMERIC(12, 2) DEFAULT 0,
  deal_id TEXT
);

CREATE TABLE public.payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.cash_drawer (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  staff_id TEXT,
  action TEXT NOT NULL,
  amount NUMERIC(12, 2),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.keyboard_pages (
  page INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled',
  cols INTEGER DEFAULT 13,
  rows INTEGER DEFAULT 7,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.keyboard_buttons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  price NUMERIC(12, 2) DEFAULT 0,
  image TEXT,
  color TEXT DEFAULT '#fff',
  bg_color TEXT DEFAULT '#1a3d2a',
  parent_id TEXT,
  category_filter TEXT,
  alpha_range TEXT,
  sort_order INTEGER DEFAULT 0,
  position TEXT DEFAULT 'grid',
  page INTEGER DEFAULT 1,
  grid_row INTEGER DEFAULT 0,
  grid_col INTEGER DEFAULT 0,
  col_span INTEGER DEFAULT 1,
  row_span INTEGER DEFAULT 1,
  product_id TEXT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  image_scale NUMERIC(8, 3) DEFAULT 100
);

CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.audit_log (
  id TEXT PRIMARY KEY,
  staff_id TEXT,
  staff_name TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deleted_records (
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (table_name, record_id)
);

CREATE INDEX public_idx_products_barcode ON public.products(barcode);
CREATE INDEX public_idx_products_plu ON public.products(plu);
CREATE INDEX public_idx_products_category ON public.products(category_id);
CREATE UNIQUE INDEX public_idx_products_plu_unique ON public.products(plu) WHERE plu IS NOT NULL AND btrim(plu) <> '';
CREATE UNIQUE INDEX public_idx_products_barcode_unique ON public.products(barcode) WHERE barcode IS NOT NULL AND btrim(barcode) <> '';
CREATE INDEX public_idx_keyboard_buttons_page ON public.keyboard_buttons(page, grid_row, grid_col);
CREATE INDEX public_idx_keyboard_buttons_product ON public.keyboard_buttons(product_id);
CREATE INDEX public_idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX public_idx_transaction_items_transaction ON public.transaction_items(transaction_id);
CREATE INDEX public_idx_payments_transaction ON public.payments(transaction_id);

CREATE VIEW public.daily_sales AS
SELECT
  DATE(created_at) AS sale_date,
  register_id,
  COUNT(*) AS txn_count,
  SUM(total) AS total_sales,
  SUM(tax) AS total_tax,
  SUM(discount) AS total_discounts
FROM public.transactions
WHERE status = 'completed'
GROUP BY DATE(created_at), register_id;

CREATE VIEW public.product_sales AS
SELECT
  ti.product_id,
  p.name,
  p.category_id,
  SUM(ti.qty) AS total_qty,
  SUM(ti.line_total) AS total_revenue,
  COUNT(DISTINCT ti.transaction_id) AS txn_count
FROM public.transaction_items ti
JOIN public.products p ON p.id = ti.product_id
JOIN public.transactions t ON t.id = ti.transaction_id
WHERE t.status = 'completed'
GROUP BY ti.product_id, p.name, p.category_id;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.daily_sales, public.product_sales TO anon, authenticated;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyboard_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyboard_buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_all_access ON public.categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_all_access ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY specials_all_access ON public.specials FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY deals_all_access ON public.deals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY deal_products_all_access ON public.deal_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_all_access ON public.staff FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY transactions_all_access ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY transaction_items_all_access ON public.transaction_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY payments_all_access ON public.payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY cash_drawer_all_access ON public.cash_drawer FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY keyboard_pages_all_access ON public.keyboard_pages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY keyboard_buttons_all_access ON public.keyboard_buttons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY settings_all_access ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY audit_log_all_access ON public.audit_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY deleted_records_all_access ON public.deleted_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.specials;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.keyboard_buttons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.keyboard_pages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
