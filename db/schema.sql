-- YieldPOS POS - Local SQLite Schema
-- This is the offline-first database that lives on each register.
-- All reads/writes hit this DB. A sync queue pushes changes to Supabase.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- â”€â”€â”€ Products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  colour      TEXT DEFAULT '#4fbd77',
  family      TEXT DEFAULT '',
  active      INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  barcode     TEXT,
  plu         TEXT,
  name        TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  price       REAL NOT NULL DEFAULT 0,
  cost_price  REAL DEFAULT 0,
  unit        TEXT DEFAULT 'each',  -- each | kg | 100g | litre
  tax_rate    REAL DEFAULT 0.10,    -- GST 10%
  track_stock INTEGER DEFAULT 0,
  stock_qty   REAL DEFAULT 0,
  active      INTEGER DEFAULT 1,
  image_url   TEXT,
  open_price  INTEGER DEFAULT 0,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_plu ON products(plu);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND TRIM(barcode) != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_plu_unique ON products(plu) WHERE plu IS NOT NULL AND TRIM(plu) != '';
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- â”€â”€â”€ Specials & Deals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS specials (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  special_price REAL NOT NULL,
  start_date  TEXT,
  end_date    TEXT,
  active      INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,  -- mix_match | buy_x_get_y | combo | discount_pct | discount_amt
  config      TEXT NOT NULL,  -- JSON: trigger conditions and reward
  start_date  TEXT,
  end_date    TEXT,
  active      INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_products (
  deal_id     TEXT NOT NULL REFERENCES deals(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  role        TEXT DEFAULT 'trigger',  -- trigger | reward
  PRIMARY KEY (deal_id, product_id)
);

-- â”€â”€â”€ Staff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS staff (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pin         TEXT NOT NULL,
  role        TEXT DEFAULT 'cashier',  -- cashier | manager | admin
  active      INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- â”€â”€â”€ Audit Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT REFERENCES staff(id),
  staff_name  TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_date ON audit_log(created_at);

-- â”€â”€â”€ Transactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  register_id   TEXT NOT NULL,
  staff_id      TEXT REFERENCES staff(id),
  customer_name TEXT,
  subtotal      REAL NOT NULL DEFAULT 0,
  tax           REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  status        TEXT DEFAULT 'completed',  -- completed | voided | refunded | parked
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  product_id      TEXT REFERENCES products(id),
  name            TEXT NOT NULL,
  qty             REAL NOT NULL DEFAULT 1,
  unit_price      REAL NOT NULL,
  discount        REAL DEFAULT 0,
  line_total      REAL NOT NULL,
  tax             REAL DEFAULT 0,
  deal_id         TEXT REFERENCES deals(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  method          TEXT NOT NULL,  -- cash | card | eftpos | account
  amount          REAL NOT NULL,
  reference       TEXT,           -- Tyro transaction ref / card last 4
  created_at      TEXT DEFAULT (datetime('now'))
);

-- â”€â”€â”€ Cash Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS cash_drawer (
  id          TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  staff_id    TEXT REFERENCES staff(id),
  action      TEXT NOT NULL,  -- open | close | float | pickup | drop
  amount      REAL,
  note        TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- â”€â”€â”€ Sync Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Every local write appends here. The sync engine reads and pushes to Supabase.

CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,  -- insert | update | delete
  payload     TEXT NOT NULL,  -- JSON of the row
  synced      INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced) WHERE synced = 0;

-- â”€â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name', 'YieldPOS'),
  ('store_address', '1164 Cavendish Rd, Mt Gravatt East QLD 4122'),
  ('store_phone', ''),
  ('store_abn', ''),
  ('store_hours', 'Open 6am - 7pm every day'),
  ('receipt_header', 'Fresh Fruit & Veg'),
  ('receipt_footer', 'Thank you for shopping local!\nOpen 6am - 7pm every day'),
  ('register_id', 'LANE01'),
  ('desired_till_float', '0'),
  ('till_desired_floats', '{}'),
  ('tax_name', 'GST'),
  ('tax_rate', '0.10'),
  ('company_logo_fit', 'contain'),
  ('company_logo_scale', '1'),
  ('auto_receipt', '1'),
  ('show_eftpos_accepted_button', '1'),
  ('price_tag_layout_3x10', ''),
  ('layout_v3_shifted', '1'),
  ('nav_buttons_fixed', '1'),
  ('next_receipt_number', '1');

-- â”€â”€â”€ Sample Categories & Products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT OR IGNORE INTO categories (id, name, sort_order, colour) VALUES
  ('cat-fruit',    'Fruit',              1, '#e8a020'),
  ('cat-veg',      'Vegetables',         2, '#409850'),
  ('cat-meat',     'Meat',               3, '#d87868'),
  ('cat-dairy',    'Dairy',              4, '#78b8d0'),
  ('cat-bread',    'Bread & Croissants', 5, '#98c030'),
  ('cat-deli',     'Deli',               6, '#a868b8'),
  ('cat-flowers',  'Flowers',            7, '#4880c0'),
  ('cat-cheese',   'Cheese',             8, '#c8c4bc'),
  ('cat-coffee',   'Coffee',             9, '#6b4226'),
  ('cat-nuts',     'Nuts',              10, '#b0a060'),
  ('cat-grocery',  'Grocery',           11, '#484848'),
  ('cat-gas',      'Gas',               12, '#b0b0b0');

INSERT OR IGNORE INTO products (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, image_url) VALUES
  ('p-banana',      '4011',     '4011',  'Bananas',            'cat-fruit', 3.99, 1.50, 'kg',   0.00, 0, NULL),
  ('p-apple-rg',    '4015',     '4015',  'Royal Gala Apples',  'cat-fruit', 5.99, 2.80, 'kg',   0.00, 0, NULL),
  ('p-apple-gsmith','4017',     '4017',  'Granny Smith Apples','cat-fruit', 5.49, 2.50, 'kg',   0.00, 0, NULL),
  ('p-orange-navel','4012',     '4012',  'Navel Oranges',      'cat-fruit', 4.99, 2.00, 'kg',   0.00, 0, NULL),
  ('p-strawberry',  '4505',     '4505',  'Strawberries Punnet','cat-fruit', 4.50, 2.00, 'each', 0.00, 1, NULL),
  ('p-avocado',     '4046',     '4046',  'Avocado Hass',       'cat-fruit', 2.50, 1.20, 'each', 0.00, 0, NULL),
  ('p-mango',       '4051',     '4051',  'Mangoes',            'cat-fruit', 3.50, 1.50, 'each', 0.00, 0, NULL),
  ('p-watermelon',  '4032',     '4032',  'Watermelon',         'cat-fruit', 1.99, 0.80, 'kg',   0.00, 0, NULL),
  ('p-tomato',      '4087',     '4087',  'Tomatoes',           'cat-veg',   5.99, 2.50, 'kg',   0.00, 0, NULL),
  ('p-potato',      '4072',     '4072',  'Potatoes Washed',    'cat-veg',   3.99, 1.50, 'kg',   0.00, 0, NULL),
  ('p-onion-brown', '4082',     '4082',  'Brown Onions',       'cat-veg',   2.99, 1.00, 'kg',   0.00, 0, NULL),
  ('p-carrot',      '4562',     '4562',  'Carrots',            'cat-veg',   2.49, 0.80, 'kg',   0.00, 0, NULL),
  ('p-broccoli',    '4060',     '4060',  'Broccoli',           'cat-veg',   5.99, 2.50, 'kg',   0.00, 0, NULL),
  ('p-lettuce',     '4061',     '4061',  'Iceberg Lettuce',    'cat-veg',   2.99, 1.20, 'each', 0.00, 0, NULL),
  ('p-capsicum-r',  '4088',     '4088',  'Red Capsicum',       'cat-veg',  12.99, 5.00, 'kg',   0.00, 0, NULL),
  ('p-mushroom',    '4065',     '4065',  'Cup Mushrooms',      'cat-veg',  12.99, 6.00, 'kg',   0.00, 0, NULL),
  ('p-chicken-breast','2001001','20010', 'Chicken Breast',     'cat-meat', 12.99, 7.00, 'kg',   0.00, 0, NULL),
  ('p-mince-beef',  '2001002',  '20011', 'Beef Mince 500g',   'cat-meat',  8.99, 5.00, 'each', 0.00, 1, NULL),
  ('p-sausages',    '2001003',  '20012', 'Beef Sausages 500g', 'cat-meat',  7.99, 4.00, 'each', 0.00, 1, NULL),
  ('p-milk-2l',     '9310036071037',NULL,'Full Cream Milk 2L', 'cat-dairy', 3.60, 2.20, 'each', 0.00, 1, NULL),
  ('p-eggs-12',     '9332022008001',NULL,'Free Range Eggs 12pk','cat-dairy',6.50, 3.50, 'each', 0.00, 1, NULL),
  ('p-butter',      '9300617003205',NULL,'Butter 250g',        'cat-dairy', 4.50, 2.80, 'each', 0.00, 1, NULL),
  ('p-sourdough',   NULL,        NULL,   'Sourdough Loaf',     'cat-bread', 7.50, 3.50, 'each', 0.00, 1, NULL),
  ('p-croissant',   NULL,        NULL,   'Croissant',          'cat-bread', 4.50, 1.80, 'each', 0.00, 1, NULL),
  ('p-baguette',    NULL,        NULL,   'Baguette',           'cat-bread', 5.00, 2.00, 'each', 0.00, 1, NULL),
  ('p-coffee-reg',  NULL,        NULL,   'Regular Coffee',     'cat-coffee',4.50, 1.50, 'each', 0.00, 0, NULL),
  ('p-coffee-lg',   NULL,        NULL,   'Large Coffee',       'cat-coffee',5.50, 1.80, 'each', 0.00, 0, NULL),
  ('p-flat-white',  NULL,        NULL,   'Flat White',         'cat-coffee',5.00, 1.60, 'each', 0.00, 0, NULL),
  ('p-cheddar',     NULL,        NULL,   'Cheddar Cheese',     'cat-cheese',12.99, 7.00,'kg',   0.00, 0, NULL),
  ('p-brie',        NULL,        NULL,   'Brie Wheel',         'cat-cheese', 8.99, 4.50,'each', 0.00, 1, NULL),
  ('p-roses',       NULL,        NULL,   'Rose Bunch',         'cat-flowers',15.00, 8.00,'each',0.00, 1, NULL),
  ('p-mixed-bunch', NULL,        NULL,   'Mixed Flower Bunch', 'cat-flowers',12.00, 6.00,'each',0.00, 1, NULL),
  ('p-mixed-nuts',  NULL,        NULL,   'Mixed Nuts 250g',    'cat-nuts',   8.99, 4.50, 'each',0.10, 1, NULL),
  ('p-cashews',     NULL,        NULL,   'Cashews 200g',       'cat-nuts',  10.99, 6.00, 'each',0.10, 1, NULL),
  ('p-bag-reusable',NULL,        NULL,   'Reusable Bag',       'cat-grocery',0.15, 0.05, 'each',0.10, 0, NULL);

-- â”€â”€â”€ Keyboard Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Configurable POS buttons. Rendered dynamically on the register screen.

CREATE TABLE IF NOT EXISTS keyboard_buttons (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL,  -- product: open_price|fixed_price|section|nav  function: return|hold|nosale|reprint|pricecheck|recall|discount|movedrawer|endofday  numpad: digit|clear|qtyx|codeenter  payment: subtotal|pay_cash|pay_card|park  nav: page_link|back_home
  price           REAL DEFAULT 0,
  image           TEXT,
  image_scale     REAL DEFAULT 100,
  font_size       REAL,
  color           TEXT DEFAULT '#fff',
  bg_color        TEXT DEFAULT '#1a3d2a',
  parent_id       TEXT,
  category_filter TEXT,
  alpha_range     TEXT,
  sort_order      INTEGER DEFAULT 0,
  position        TEXT DEFAULT 'main',  -- main | bottom (legacy)
  page            INTEGER DEFAULT 1,
  grid_row        INTEGER DEFAULT 0,
  grid_col        INTEGER DEFAULT 0,
  col_span        INTEGER DEFAULT 1,
  row_span        INTEGER DEFAULT 1,
  product_id      TEXT REFERENCES products(id),
  active          INTEGER DEFAULT 1,
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyboard_pages (
  page    INTEGER PRIMARY KEY,
  name    TEXT NOT NULL DEFAULT 'Untitled',
  cols    INTEGER DEFAULT 13,
  rows    INTEGER DEFAULT 7
);

INSERT OR IGNORE INTO keyboard_pages (page, name, cols, rows) VALUES
  (1, 'Main Register', 13, 7),
  (2, 'Fruit A-M', 13, 7),
  (3, 'Fruit N-Z', 13, 7),
  (4, 'Vegetables A-G', 13, 7),
  (5, 'Vegetables H-Z', 13, 7),
  (6, 'Grocery', 13, 7),
  (7, 'Apples', 13, 7),
  (8, 'Apricots', 13, 7),
  (9, 'Avocados', 13, 7),
  (10, 'Bananas', 13, 7),
  (11, 'Grapes', 13, 7),
  (12, 'Kiwifruits', 13, 7),
  (13, 'Lemons', 13, 7),
  (14, 'Limes', 13, 7),
  (15, 'Mandarins', 13, 7),
  (16, 'Mangoes', 13, 7),
  (17, 'Melons', 13, 7),
  (18, 'Nectarines', 13, 7),
  (19, 'Oranges', 13, 7),
  (20, 'Peaches', 13, 7),
  (21, 'Pears', 13, 7),
  (22, 'Plums', 13, 7),
  (23, 'Beetroot', 13, 7),
  (24, 'Broccoli', 13, 7),
  (25, 'Cabbage', 13, 7),
  (26, 'Capsicum', 13, 7),
  (27, 'Chillies', 13, 7),
  (28, 'Garlic', 13, 7),
  (29, 'Lettuces', 13, 7),
  (30, 'Mushrooms', 13, 7),
  (31, 'Onions', 13, 7),
  (32, 'Potatoes', 13, 7),
  (33, 'Pumpkins', 13, 7),
  (34, 'Sweet Potatoes', 13, 7),
  (35, 'Tomatoes', 13, 7),
  (36, 'Zucchini', 13, 7);

-- Default Page 1 layout â€” matches user's working register
-- Row 0: Function buttons (cols 0-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('fn-reprint',    'REPRINT\nRECEIPT', 'reprint',   '#fff', '#64748b', 1,  'grid', 1, 0, 0, 3, 1, NULL),
  ('fn-endofday',   'END OF\nDAY',      'endofday',  '#fff', '#6d28d9', 2,  'grid', 1, 0, 3, 2, 1, NULL),
  ('fn-hold',       'HOLD\nSALE',       'hold',      '#fff', '#2563eb', 3,  'grid', 1, 0, 5, 2, 1, NULL),
  ('fn-itemsearch', 'ITEM\nSEARCH',     'item_search','#fff','#0f766e', 4,  'grid', 1, 0, 7, 2, 1, NULL),
  ('fn-nosale',     'OPEN\nDRAWER',     'nosale',    '#fff', '#b45309', 5,  'grid', 1, 0, 9, 2, 1, NULL),
  ('fn-pricecheck', 'PRICE CHECK',      'pricecheck','#fff', '#64748b', 6,  'grid', 1, 0, 11, 2, 2, NULL);

-- Cart display area (cols 0-2, rows 1-6)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('layout-cart',    'Cart',            'cart_display', '#000', '#ffffff', 10, 'grid', 1, 1, 0, 3, 6, NULL);

-- Row 1: Function buttons (cols 3-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('fn-discount',   'DISCOUNT',         'discount',  '#f8f4ea', '#1f5d3c', 11, 'grid', 1, 1, 3, 2, 1, NULL),
  ('fn-movedrawer', 'LOG OUT',          'movedrawer','#f8f4ea', '#1f5d3c', 12, 'grid', 1, 1, 5, 2, 1, NULL),
  ('fn-return',     'RETURN\nITEM',     'return',    '#f8f4ea', '#1f5d3c', 13, 'grid', 1, 1, 7, 2, 1, NULL),
  ('fn-recall',     'FIND\nSALE',       'recall',    '#f8f4ea', '#1f5d3c', 14, 'grid', 1, 1, 9, 2, 1, NULL);

-- Rows 2-4: Department buttons (cols 3-6) + single items (col 7) + Numpad (cols 8-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('btn-meat',    'MEAT',              'open_price',  0,    '#fff', '#8f2d38', 20, 'grid', 1, 2, 3, 2, 1, NULL),
  ('btn-flowers', 'FLOWERS',           'open_price',  0,    '#fff', '#be185d', 21, 'grid', 1, 2, 5, 2, 1, NULL),
  ('btn-fv',      'FRUIT & VEG\nOPEN PRICE', 'open_price',  0,    '#fff', '#166534', 22, 'grid', 1, 2, 7, 1, 1, NULL),
  ('btn-coffee',  'COFFEE',            'open_price',  0,    '#fff', '#6b4f3f', 23, 'grid', 1, 3, 3, 2, 1, NULL),
  ('btn-bread',   'BREAD &\nCROISSAN', 'section',     0,    '#fff', '#92400e', 24, 'grid', 1, 3, 5, 2, 1, 'Bread & Croissants'),
  ('btn-fvkg',    'FRUIT & VEG\n/KG',  'weighed_open',0,    '#fff', '#047857', 25, 'grid', 1, 3, 7, 1, 1, NULL),
  ('btn-deli',    'DELI',              'section',     0,    '#fff', '#9f1239', 26, 'grid', 1, 4, 3, 2, 1, 'Deli'),
  ('btn-cheese',  'CHEESE',            'open_price',  0,    '#fff', '#a16207', 27, 'grid', 1, 4, 5, 2, 1, NULL),
  ('btn-bags',    'BAG',               'fixed_price', 0.15, '#fff', '#334155', 28, 'grid', 1, 4, 7, 1, 1, NULL);
UPDATE keyboard_buttons
SET type = 'product', product_id = 'p-bag-reusable', category_filter = NULL, parent_id = NULL
WHERE id = 'btn-bags';

-- Row 5: Navigation + misc (cols 3-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id, category_filter) VALUES
  ('btn-grocery',  'GROCERY',   'page_link', 0, '#fff', '#2563eb', 30, 'grid', 1, 5, 3, 1, 1, '6',  NULL),
  ('btn-grocery-open', 'GROCERY\nOPEN PRICE', 'open_price', 0, '#fff', '#334155', 30, 'grid', 1, 5, 4, 1, 1, NULL, NULL),
  ('btn-nuts',     'NUTS',      'nav',       0, '#fff', '#7c2d12', 31, 'grid', 1, 5, 5, 2, 1, NULL, 'Nuts'),
  ('btn-gas',      'GAS',       'section',   0, '#fff', '#475569', 32, 'grid', 1, 5, 7, 1, 1, NULL, 'Gas');

-- Numpad buttons (rows 2-5, cols 8-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('np-7',     '7',          'digit',     '#000', '#ffffff', 40, 'grid', 1, 2, 8, 1, 1, '7'),
  ('np-8',     '8',          'digit',     '#000', '#ffffff', 41, 'grid', 1, 2, 9, 1, 1, '8'),
  ('np-9',     '9',          'digit',     '#000', '#ffffff', 42, 'grid', 1, 2, 10, 1, 1, '9'),
  ('np-qtyx',  'QTY X',      'qtyx',      '#000', '#e07020', 43, 'grid', 1, 2, 11, 2, 1, NULL),
  ('np-4',     '4',          'digit',     '#000', '#ffffff', 44, 'grid', 1, 3, 8, 1, 1, '4'),
  ('np-5',     '5',          'digit',     '#000', '#ffffff', 45, 'grid', 1, 3, 9, 1, 1, '5'),
  ('np-6',     '6',          'digit',     '#000', '#ffffff', 46, 'grid', 1, 3, 10, 1, 1, '6'),
  ('np-clear', 'CLEAR',      'clear',     '#000', '#eeeeee', 47, 'grid', 1, 3, 11, 2, 2, NULL),
  ('np-1',     '1',          'digit',     '#000', '#ffffff', 48, 'grid', 1, 4, 8, 1, 1, '1'),
  ('np-2',     '2',          'digit',     '#000', '#ffffff', 49, 'grid', 1, 4, 9, 1, 1, '2'),
  ('np-3',     '3',          'digit',     '#000', '#ffffff', 50, 'grid', 1, 4, 10, 1, 1, '3'),
  ('np-0',     '0',          'digit',     '#000', '#ffffff', 51, 'grid', 1, 5, 8, 1, 1, '0'),
  ('np-00',    '00',         'digit',     '#000', '#ffffff', 52, 'grid', 1, 5, 9, 2, 1, '00');

-- SUB TOTAL button (rows 5-6, cols 11-12)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, category_filter) VALUES
  ('btn-subtotal', 'SUB TOTAL', 'subtotal', '#fff', '#15803d', 55, 'grid', 1, 5, 11, 2, 2, NULL);

-- Row 6: Bottom navigation (cols 3-10)
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id, category_filter, alpha_range) VALUES
  ('btn-fruit-am', 'FRUIT A-M', 'page_link','#fff', '#65a30d', 60, 'grid', 1, 6, 3, 2, 1, '2',  NULL, NULL),
  ('btn-fruit-nz', 'FRUIT N-Z', 'page_link','#fff', '#65a30d', 61, 'grid', 1, 6, 5, 2, 1, '3',  NULL, NULL),
  ('btn-veg-ag',   'VEGE A-G',  'page_link','#fff', '#15803d', 62, 'grid', 1, 6, 7, 2, 1, '4',  NULL, NULL),
  ('btn-veg-hz',   'VEGE H-Z',  'page_link','#fff', '#15803d', 63, 'grid', 1, 6, 9, 2, 1, '5',  NULL, NULL);

-- â•â•â• Page 2: Fruit A-M â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg2-apples',       'APPLES\n$5.99/kg',          'page_link',  5.99,  'images/products/coles-5111654-zm.jpg', '#fff', '#1a3d2a', 1,  'grid', 2, 0, 0, 1, 1, '7'),
  ('pg2-apricots',     'APRICOTS\n$12.99/kg',       'page_link',  12.99, 'images/products/coles-409477-zm.jpg', '#fff', '#1a3d2a', 2,  'grid', 2, 0, 1, 1, 1, '8'),
  ('pg2-avocados',     'AVOCADOS\n$2.50 ea',        'page_link',  2.50,  'images/products/coles-5900530-zm.jpg', '#fff', '#1a3d2a', 3,  'grid', 2, 0, 2, 1, 1, '9'),
  ('pg2-bananas',      'BANANAS\n$3.99/kg',         'page_link',  3.99,  'images/products/coles-409499-zm.jpg', '#fff', '#1a3d2a', 4,  'grid', 2, 0, 3, 1, 1, '10'),
  ('pg2-cherries',     'CHERRIES KG\n$14.99/kg',    'open_price', 14.99, 'images/products/coles-409535-zm.jpg', '#fff', '#1a3d2a', 5,  'grid', 2, 0, 4, 1, 1, NULL),
  ('pg2-coconut',      'COCONUT EA\n$4.99 ea',      'open_price', 4.99,  'images/products/coles-409557-zm.jpg', '#fff', '#1a3d2a', 6,  'grid', 2, 0, 5, 1, 1, NULL),
  ('pg2-custard-apple','CUSTARD APPLE KG\n$6.99/kg','open_price', 6.99,  'images/products/coles-409568-zm.jpg', '#fff', '#1a3d2a', 7,  'grid', 2, 1, 0, 1, 1, NULL),
  ('pg2-dragon-fruit', 'DRAGON FRUIT KG\n$14.99/kg','open_price', 14.99, 'images/products/coles-6866880-zm.jpg', '#fff', '#1a3d2a', 8,  'grid', 2, 1, 1, 1, 1, NULL),
  ('pg2-figs',         'FIGS KG\n$19.99/kg',        'open_price', 19.99, 'images/products/coles-6867033-zm.jpg', '#fff', '#1a3d2a', 9,  'grid', 2, 1, 2, 1, 1, NULL),
  ('pg2-grapes',       'GRAPES\n$7.99/kg',          'page_link',  7.99,  'images/products/coles-6706191-zm.jpg', '#fff', '#1a3d2a', 10, 'grid', 2, 1, 3, 1, 1, '11'),
  ('pg2-grapefruit',   'GRAPEFRUIT KG\n$4.99/kg',   'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 11, 'grid', 2, 1, 4, 1, 1, NULL),
  ('pg2-guava',        'GUAVA KG\n$8.99/kg',        'open_price', 8.99,  NULL, '#fff', '#1a3d2a', 12, 'grid', 2, 2, 0, 1, 1, NULL),
  ('pg2-kiwi',         'KIWI FRUITS\n$2.00 ea',     'page_link',  2.00,  NULL, '#fff', '#1a3d2a', 13, 'grid', 2, 2, 1, 1, 1, '12'),
  ('pg2-lemons',       'LEMONS\n$8.99/kg',          'page_link',  8.99,  NULL, '#fff', '#1a3d2a', 14, 'grid', 2, 2, 2, 1, 1, '13'),
  ('pg2-limes',        'LIMES\n$1.50 ea',           'page_link',  1.50,  NULL, '#fff', '#1a3d2a', 15, 'grid', 2, 2, 3, 1, 1, '14'),
  ('pg2-longan',       'LONGAN KG\n$12.99/kg',      'open_price', 12.99, NULL, '#fff', '#1a3d2a', 16, 'grid', 2, 2, 4, 1, 1, NULL),
  ('pg2-lychee',       'LYCHEE KG\n$14.99/kg',      'open_price', 14.99, NULL, '#fff', '#1a3d2a', 17, 'grid', 2, 2, 5, 1, 1, NULL),
  ('pg2-mandarins',    'MANDARINS\n$5.99/kg',       'page_link',  5.99,  NULL, '#fff', '#1a3d2a', 18, 'grid', 2, 3, 0, 1, 1, '15'),
  ('pg2-mangoes',      'MANGOES\n$3.50 ea',         'page_link',  3.50,  'images/products/coles-8925050-zm.jpg', '#fff', '#1a3d2a', 19, 'grid', 2, 3, 1, 1, 1, '16'),
  ('pg2-melons',       'MELONS\n$3.99/kg',          'page_link',  3.99,  NULL, '#fff', '#1a3d2a', 20, 'grid', 2, 3, 2, 1, 1, '17'),
  ('pg2-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 2, 0, 7, 3, 1, NULL),
  ('pg2-veg-menu',     'Vegetable\nMenu',           'page_link',  0,     NULL, '#000', '#86efac', 91, 'grid', 2, 1, 7, 3, 1, '4'),
  ('pg2-next-fruit',   'NEXT\nKEYBOARD\nFRUIT>',    'page_link',  0,     NULL, '#000', '#86efac', 92, 'grid', 2, 2, 7, 3, 2, '3');

-- â•â•â• Page 3: Fruit N-Z â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg3-nectarines',   'NECTARINES\n$7.99/kg',      'page_link',  7.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 3, 0, 0, 1, 1, '18'),
  ('pg3-oranges',      'ORANGES\n$4.99/kg',         'page_link',  4.99,  'images/products/coles-4255717-zm.jpg', '#fff', '#1a3d2a', 2,  'grid', 3, 0, 1, 1, 1, '19'),
  ('pg3-passion-fruit','PASSION FRUIT EA\n$1.50 ea','open_price', 1.50,  NULL, '#fff', '#1a3d2a', 3,  'grid', 3, 0, 2, 1, 1, NULL),
  ('pg3-papaya',       'PAPAYA RED KG\n$5.99/kg',   'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 3, 0, 3, 1, 1, NULL),
  ('pg3-pawpaw',       'PAW PAW GREEN KG\n$4.99/kg','open_price', 4.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 3, 0, 4, 1, 1, NULL),
  ('pg3-peaches',      'PEACHES\n$7.99/kg',         'page_link',  7.99,  NULL, '#fff', '#1a3d2a', 6,  'grid', 3, 0, 5, 1, 1, '20'),
  ('pg3-pears',        'PEARS\n$5.99/kg',           'page_link',  5.99,  NULL, '#fff', '#1a3d2a', 7,  'grid', 3, 1, 0, 1, 1, '21'),
  ('pg3-persimmons',   'PERSIMMONS KG\n$9.99/kg',   'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 8,  'grid', 3, 1, 1, 1, 1, NULL),
  ('pg3-pineapple-sm', 'SM PINEAPPLE EA\n$3.99 ea', 'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 9,  'grid', 3, 1, 2, 1, 1, NULL),
  ('pg3-pineapple-md', 'MED PINEAPPLE EA\n$4.99 ea','open_price', 4.99,  NULL, '#fff', '#1a3d2a', 10, 'grid', 3, 1, 3, 1, 1, NULL),
  ('pg3-pineapple-xl', 'XL PINEAPPLE EA\n$6.99 ea', 'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 11, 'grid', 3, 1, 4, 1, 1, NULL),
  ('pg3-plums',        'PLUMS\n$9.99/kg',           'page_link',  9.99,  NULL, '#fff', '#1a3d2a', 12, 'grid', 3, 1, 5, 1, 1, '22'),
  ('pg3-pomegranate',  'POMEGRANATE EA\n$3.99 ea',  'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 13, 'grid', 3, 2, 0, 1, 1, NULL),
  ('pg3-pommelo',      'POMMELO KG\n$6.99/kg',      'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 14, 'grid', 3, 2, 1, 1, 1, NULL),
  ('pg3-quince',       'QUINCE KG\n$7.99/kg',       'open_price', 7.99,  'images/remote/147315-3e4f1ceeb870.jpg', '#fff', '#1a3d2a', 15, 'grid', 3, 2, 2, 1, 1, NULL),
  ('pg3-tangello',     'TANGELLO KG\n$4.99/kg',     'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 16, 'grid', 3, 2, 3, 1, 1, NULL),
  ('pg3-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 3, 0, 7, 3, 1, NULL),
  ('pg3-prev-fruit',   '<BACK\nKEYBOARD\nFRUIT',    'page_link',  0,     NULL, '#000', '#86efac', 91, 'grid', 3, 2, 7, 3, 1, '2');

-- â•â•â• Page 4: Vegetables A-G â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg4-asian-vege',   'ASIAN VEGE EA\n$3.99 ea',   'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 4, 0, 0, 1, 1, NULL),
  ('pg4-asparagus',    'ASPARAGUS EA\n$4.99 ea',    'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 4, 0, 1, 1, 1, NULL),
  ('pg4-beans',        'BEANS KG\n$9.99/kg',        'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 4, 0, 2, 1, 1, NULL),
  ('pg4-beetroot',     'BEETROOT\n$4.99/kg',        'page_link',  4.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 4, 0, 3, 1, 1, '23'),
  ('pg4-bottle-gourd', 'BOTTLE GOURD\n$5.99/kg',    'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 4, 0, 4, 1, 1, NULL),
  ('pg4-broccoli',     'BROCCOLI\n$5.99/kg',        'page_link',  5.99,  'images/products/coles-407755-zm.jpg', '#fff', '#1a3d2a', 6,  'grid', 4, 0, 5, 1, 1, '24'),
  ('pg4-brussels',     'BRUSSEL SPROUTS KG\n$12.99/kg','open_price',12.99,'images/remote/960px-brussels-sprouts-on-white-background-9d197d7d1388.jpg','#fff', '#1a3d2a', 7,  'grid', 4, 1, 0, 1, 1, NULL),
  ('pg4-cabbage',      'CABBAGE\n$3.99 ea',         'page_link',  3.99,  'images/remote/pexels-photo-13796758-10427484d03f.jpg', '#fff', '#1a3d2a', 8,  'grid', 4, 1, 1, 1, 1, '25'),
  ('pg4-capsicum',     'CAPSICUM\n$12.99/kg',       'page_link',  12.99, 'images/products/coles-4580208-zm.jpg', '#fff', '#1a3d2a', 9,  'grid', 4, 1, 2, 1, 1, '26'),
  ('pg4-carrots',      'CARROTS LOOSE KG\n$2.49/kg','open_price', 2.49,  'images/products/coles-4223335-zm.jpg', '#fff', '#1a3d2a', 10, 'grid', 4, 1, 3, 1, 1, NULL),
  ('pg4-carrot-bag',   'CARROT BAG EA\n$2.99 ea',   'open_price', 2.99,  'images/remote/4223335-zm-8e1f68da7eac.jpg', '#fff', '#1a3d2a', 11, 'grid', 4, 1, 4, 1, 1, NULL),
  ('pg4-cauliflower',  'CAULIFLOWER EA\n$4.99 ea',  'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 12, 'grid', 4, 1, 5, 1, 1, NULL),
  ('pg4-celery',       'WHOLE CELERY EA\n$3.99 ea', 'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 13, 'grid', 4, 2, 0, 1, 1, NULL),
  ('pg4-celeriac',     'CELERIAC EA\n$5.99 ea',     'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 14, 'grid', 4, 2, 1, 1, 1, NULL),
  ('pg4-chillies',     'CHILLIES\n$29.99/kg',       'page_link',  29.99, 'images/products/coles-8760314-zm.jpg', '#fff', '#1a3d2a', 15, 'grid', 4, 2, 2, 1, 1, '27'),
  ('pg4-chokos',       'CHOKOS KG\n$4.99/kg',       'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 16, 'grid', 4, 2, 3, 1, 1, NULL),
  ('pg4-corn',         'CORN EA\n$1.99 ea',         'open_price', 1.99,  NULL, '#fff', '#1a3d2a', 17, 'grid', 4, 2, 4, 1, 1, NULL),
  ('pg4-cucumbers',    'CUCUMBERS\n$2.99 ea',       'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 18, 'grid', 4, 2, 5, 1, 1, NULL),
  ('pg4-eggplant',     'EGGPLANT KG\n$5.99/kg',     'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 19, 'grid', 4, 3, 0, 1, 1, NULL),
  ('pg4-leb-eggplant', 'LEB EGGPLANT KG\n$7.99/kg', 'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 20, 'grid', 4, 3, 1, 1, 1, NULL),
  ('pg4-fennel',       'FENNEL EA\n$4.99 ea',       'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 21, 'grid', 4, 3, 2, 1, 1, NULL),
  ('pg4-garlic',       'GARLIC\n$19.99/kg',         'page_link',  19.99, NULL, '#fff', '#1a3d2a', 22, 'grid', 4, 3, 3, 1, 1, '28'),
  ('pg4-ginger',       'GINGER KG\n$24.99/kg',      'open_price', 24.99, NULL, '#fff', '#1a3d2a', 23, 'grid', 4, 3, 4, 1, 1, NULL),
  ('pg4-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 4, 0, 7, 3, 1, NULL),
  ('pg4-fruit-menu',   'FRUIT\nMENU',               'page_link',  0,     NULL, '#000', '#86efac', 91, 'grid', 4, 1, 7, 3, 1, '2'),
  ('pg4-next-veg',     'NEXT\nKEYBOARD\nVEGE>',     'page_link',  0,     NULL, '#000', '#86efac', 92, 'grid', 4, 2, 7, 3, 2, '5');

-- â•â•â• Page 5: Vegetables H-Z â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg5-herbs',        'HERBS\n$2.99 ea',           'open_price', 2.99,  'images/remote/pexels-photo-4113890-9648b8d603b9.jpg', '#fff', '#1a3d2a', 1,  'grid', 5, 0, 0, 1, 1, NULL),
  ('pg5-kale',         'KALE EA\n$3.99 ea',         'open_price', 3.99,  'images/products/coles-8696598-zm.jpg', '#fff', '#1a3d2a', 2,  'grid', 5, 0, 1, 1, 1, NULL),
  ('pg5-leeks',        'LEEKS EA\n$3.99 ea',        'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 5, 0, 2, 1, 1, NULL),
  ('pg5-lettuces',     'LETTUCES\n$2.99 ea',        'page_link',  2.99,  'images/products/coles-4584071-zm.jpg', '#fff', '#1a3d2a', 4,  'grid', 5, 0, 3, 1, 1, '29'),
  ('pg5-lettuce-bags', 'LETTUCE BAGS EA\n$3.99 ea', 'open_price', 3.99,  'images/remote/pexels-photo-4519016-49d06a01e9c4.jpg', '#fff', '#1a3d2a', 5,  'grid', 5, 0, 4, 1, 1, NULL),
  ('pg5-lobok',        'LOBOK KG\n$4.99/kg',        'open_price', 4.99,  'images/products/coles-6614720-zm.jpg', '#fff', '#1a3d2a', 6,  'grid', 5, 0, 5, 1, 1, NULL),
  ('pg5-mushrooms',    'MUSHROOMS\n$12.99/kg',      'page_link',  12.99, 'images/remote/pexels-photo-5950411-84543b28df41.jpg', '#fff', '#1a3d2a', 7,  'grid', 5, 1, 0, 1, 1, '30'),
  ('pg5-olives',       'OLIVES KG\n$14.99/kg',      'open_price', 14.99, NULL, '#fff', '#1a3d2a', 8,  'grid', 5, 1, 1, 1, 1, NULL),
  ('pg5-onions',       'ONIONS\n$2.99/kg',          'page_link',  2.99,  'images/remote/pexels-photo-12296935-52ab5a87da33.jpg', '#fff', '#1a3d2a', 9,  'grid', 5, 1, 2, 1, 1, '31'),
  ('pg5-parsnip',      'PARSNIP KG\n$7.99/kg',      'open_price', 7.99,  'images/products/new-parsnip.png', '#fff', '#1a3d2a', 10, 'grid', 5, 1, 3, 1, 1, NULL),
  ('pg5-peas',         'PEAS KG\n$9.99/kg',         'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 11, 'grid', 5, 1, 4, 1, 1, NULL),
  ('pg5-potatoes',     'POTATOES\n$3.99/kg',        'page_link',  3.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 12, 'grid', 5, 1, 5, 1, 1, '32'),
  ('pg5-pumpkins',     'PUMPKINS\n$2.99/kg',        'page_link',  2.99,  NULL, '#fff', '#1a3d2a', 13, 'grid', 5, 2, 0, 1, 1, '33'),
  ('pg5-radish',       'RADISH BUNCH EA\n$2.99 ea', 'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 14, 'grid', 5, 2, 1, 1, 1, NULL),
  ('pg5-rhubarb',      'RHUBARB EA\n$4.99 ea',      'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 15, 'grid', 5, 2, 2, 1, 1, NULL),
  ('pg5-shallots',     'SHALLOTS EA\n$2.99 ea',     'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 16, 'grid', 5, 2, 3, 1, 1, NULL),
  ('pg5-silverbeet',   'SILVERBEET EA\n$3.99 ea',   'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 17, 'grid', 5, 2, 4, 1, 1, NULL),
  ('pg5-snow-peas',    'SNOW PEAS KG\n$14.99/kg',   'open_price', 14.99, NULL, '#fff', '#1a3d2a', 18, 'grid', 5, 2, 5, 1, 1, NULL),
  ('pg5-sugar-snap',   'SUGAR SNAP PEAS KG\n$14.99/kg','open_price',14.99,'images/products/coles-123328-zm.jpg','#fff', '#1a3d2a', 19, 'grid', 5, 3, 0, 1, 1, NULL),
  ('pg5-swedes',       'SWEDES KG\n$4.99/kg',       'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 20, 'grid', 5, 3, 1, 1, 1, NULL),
  ('pg5-sweet-potato', 'SWEET POTATOES\n$4.99/kg',  'page_link',  4.99,  NULL, '#fff', '#1a3d2a', 21, 'grid', 5, 3, 2, 1, 1, '34'),
  ('pg5-tomatoes',     'TOMATOES\n$5.99/kg',        'page_link',  5.99,  'images/remote/pexels-photo-9816726-0b364aa1abfc.jpg', '#fff', '#1a3d2a', 22, 'grid', 5, 3, 3, 1, 1, '35'),
  ('pg5-turnip',       'TURNIP KG\n$3.99/kg',       'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 23, 'grid', 5, 3, 4, 1, 1, NULL),
  ('pg5-zucchini',     'ZUCCHINI\n$5.99/kg',        'page_link',  5.99,  NULL, '#fff', '#1a3d2a', 24, 'grid', 5, 3, 5, 1, 1, '36'),
  ('pg5-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 5, 0, 7, 3, 1, NULL),
  ('pg5-fruit-menu',   'FRUIT\nMENU',               'page_link',  0,     NULL, '#000', '#86efac', 91, 'grid', 5, 1, 7, 3, 1, '2'),
  ('pg5-prev-veg',     '<BACK\nKEYBOARD\nVEG',      'page_link',  0,     NULL, '#000', '#86efac', 92, 'grid', 5, 2, 7, 3, 1, '4');

-- â•â•â• Pages 7-22: Fruit category sub-pages â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- Page 7: Apples
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg7-pink-lady',    'PINK LADY\n$5.99/kg',       'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 7, 0, 0, 2, 1, NULL),
  ('pg7-granny-smith', 'GRANNY SMITH\n$4.99/kg',    'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 7, 0, 2, 2, 1, NULL),
  ('pg7-fuji',         'FUJI\n$5.99/kg',            'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 7, 0, 4, 2, 1, NULL),
  ('pg7-royal-gala',   'ROYAL GALA\n$5.99/kg',      'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 7, 0, 6, 2, 1, NULL),
  ('pg7-red-delicious','RED DELICIOUS\n$4.99/kg',   'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 7, 0, 8, 2, 1, NULL),
  ('pg7-jazz',         'JAZZ\n$6.99/kg',            'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 6,  'grid', 7, 1, 0, 2, 1, NULL),
  ('pg7-braeburn',     'BRAEBURN\n$5.49/kg',        'open_price', 5.49,  NULL, '#fff', '#1a3d2a', 7,  'grid', 7, 1, 2, 2, 1, NULL),
  ('pg7-golden-del',   'GOLDEN DEL\n$4.99/kg',      'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 8,  'grid', 7, 1, 4, 2, 1, NULL),
  ('pg7-apple-bag',    'APPLE BAG\n$4.99 ea',       'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 9,  'grid', 7, 1, 6, 2, 1, NULL),
  ('pg7-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 7, 0, 10, 3, 1, NULL);

-- Page 8: Apricots
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg8-apricots-kg',  'APRICOTS KG\n$12.99/kg',   'open_price', 12.99, NULL, '#fff', '#1a3d2a', 1,  'grid', 8, 0, 0, 2, 1, NULL),
  ('pg8-apricots-ea',  'APRICOTS EA\n$1.50 ea',    'open_price', 1.50,  NULL, '#fff', '#1a3d2a', 2,  'grid', 8, 0, 2, 2, 1, NULL),
  ('pg8-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 8, 0, 10, 3, 1, NULL);

-- Page 9: Avocados
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg9-avo-ea',       'AVOCADO EA\n$2.50 ea',     'open_price', 2.50,  NULL, '#fff', '#1a3d2a', 1,  'grid', 9, 0, 0, 2, 1, NULL),
  ('pg9-avo-sm',       'SM AVOCADO\n$1.50 ea',     'open_price', 1.50,  NULL, '#fff', '#1a3d2a', 2,  'grid', 9, 0, 2, 2, 1, NULL),
  ('pg9-avo-lg',       'LG AVOCADO\n$3.50 ea',     'open_price', 3.50,  NULL, '#fff', '#1a3d2a', 3,  'grid', 9, 0, 4, 2, 1, NULL),
  ('pg9-avo-bag',      'AVO BAG\n$5.99 ea',        'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 9, 0, 6, 2, 1, NULL),
  ('pg9-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 9, 0, 10, 3, 1, NULL);

-- Page 10: Bananas
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg10-bananas-kg',  'BANANAS KG\n$3.99/kg',     'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 10, 0, 0, 2, 1, NULL),
  ('pg10-lady-finger', 'LADY FINGER\n$5.99/kg',    'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 10, 0, 2, 2, 1, NULL),
  ('pg10-red-banana',  'RED BANANA\n$7.99/kg',     'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 10, 0, 4, 2, 1, NULL),
  ('pg10-plantain',    'PLANTAIN\n$4.99/kg',       'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 10, 0, 6, 2, 1, NULL),
  ('pg10-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 10, 0, 10, 3, 1, NULL);

-- Page 11: Grapes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg11-green-grapes','GREEN GRAPES\n$7.99/kg',   'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 11, 0, 0, 2, 1, NULL),
  ('pg11-red-grapes',  'RED GRAPES\n$7.99/kg',     'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 11, 0, 2, 2, 1, NULL),
  ('pg11-black-grapes','BLACK GRAPES\n$8.99/kg',   'open_price', 8.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 11, 0, 4, 2, 1, NULL),
  ('pg11-grapes-bag',  'GRAPE PUNNET\n$6.99 ea',   'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 11, 0, 6, 2, 1, NULL),
  ('pg11-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 11, 0, 10, 3, 1, NULL);

-- Page 12: Kiwifruits
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg12-green-kiwi',  'GREEN KIWI\n$2.00 ea',    'open_price', 2.00,  NULL, '#fff', '#1a3d2a', 1,  'grid', 12, 0, 0, 2, 1, NULL),
  ('pg12-gold-kiwi',   'GOLD KIWI\n$2.50 ea',     'open_price', 2.50,  NULL, '#fff', '#1a3d2a', 2,  'grid', 12, 0, 2, 2, 1, NULL),
  ('pg12-kiwi-pack',   'KIWI 4-PACK\n$5.99 ea',   'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 12, 0, 4, 2, 1, NULL),
  ('pg12-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 12, 0, 10, 3, 1, NULL);

-- Page 13: Lemons
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg13-lemons-kg',   'LEMONS KG\n$8.99/kg',     'open_price', 8.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 13, 0, 0, 2, 1, NULL),
  ('pg13-lemons-ea',   'LEMONS EA\n$1.00 ea',     'open_price', 1.00,  NULL, '#fff', '#1a3d2a', 2,  'grid', 13, 0, 2, 2, 1, NULL),
  ('pg13-lemon-bag',   'LEMON BAG\n$3.99 ea',     'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 13, 0, 4, 2, 1, NULL),
  ('pg13-meyer-lemon', 'MEYER LEMON\n$12.99/kg',  'open_price', 12.99, NULL, '#fff', '#1a3d2a', 4,  'grid', 13, 0, 6, 2, 1, NULL),
  ('pg13-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 13, 0, 10, 3, 1, NULL);

-- Page 14: Limes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg14-limes-ea',    'LIMES EA\n$1.50 ea',      'open_price', 1.50,  NULL, '#fff', '#1a3d2a', 1,  'grid', 14, 0, 0, 2, 1, NULL),
  ('pg14-limes-kg',    'LIMES KG\n$12.99/kg',     'open_price', 12.99, NULL, '#fff', '#1a3d2a', 2,  'grid', 14, 0, 2, 2, 1, NULL),
  ('pg14-lime-bag',    'LIME BAG\n$4.99 ea',      'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 14, 0, 4, 2, 1, NULL),
  ('pg14-kaffir-lime', 'KAFFIR LIME\n$2.99 ea',   'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 14, 0, 6, 2, 1, NULL),
  ('pg14-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 14, 0, 10, 3, 1, NULL);

-- Page 15: Mandarins
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg15-imperial',    'IMPERIAL\n$5.99/kg',       'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 15, 0, 0, 2, 1, NULL),
  ('pg15-afourer',     'AFOURER\n$6.99/kg',       'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 15, 0, 2, 2, 1, NULL),
  ('pg15-mandarin-bag','MANDARIN BAG\n$4.99 ea',  'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 15, 0, 4, 2, 1, NULL),
  ('pg15-mandarin-kg', 'MANDARIN KG\n$5.99/kg',   'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 15, 0, 6, 2, 1, NULL),
  ('pg15-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 15, 0, 10, 3, 1, NULL);

-- Page 16: Mangoes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg16-kp-mango',    'KP MANGO\n$3.50 ea',      'open_price', 3.50,  NULL, '#fff', '#1a3d2a', 1,  'grid', 16, 0, 0, 2, 1, NULL),
  ('pg16-r2e2',        'R2E2\n$4.50 ea',          'open_price', 4.50,  NULL, '#fff', '#1a3d2a', 2,  'grid', 16, 0, 2, 2, 1, NULL),
  ('pg16-calypso',     'CALYPSO\n$3.99 ea',       'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 16, 0, 4, 2, 1, NULL),
  ('pg16-honey-gold',  'HONEY GOLD\n$3.99 ea',    'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 16, 0, 6, 2, 1, NULL),
  ('pg16-mango-tray',  'MANGO TRAY\n$9.99 ea',    'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 16, 1, 0, 2, 1, NULL),
  ('pg16-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 16, 0, 10, 3, 1, NULL);

-- Page 17: Melons
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg17-watermelon',  'WATERMELON\n$1.99/kg',    'open_price', 1.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 17, 0, 0, 2, 1, NULL),
  ('pg17-rockmelon',   'ROCKMELON\n$3.99/kg',     'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 17, 0, 2, 2, 1, NULL),
  ('pg17-honeydew',    'HONEYDEW\n$3.99/kg',      'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 17, 0, 4, 2, 1, NULL),
  ('pg17-wm-half',     'WATERMELON\nHALF',        'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 17, 0, 6, 2, 1, NULL),
  ('pg17-wm-quarter',  'WATERMELON\nQUARTER',     'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 17, 1, 0, 2, 1, NULL),
  ('pg17-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 17, 0, 10, 3, 1, NULL);

-- Page 18: Nectarines
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg18-white-nect',  'WHITE NECT\n$9.99/kg',    'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 18, 0, 0, 2, 1, NULL),
  ('pg18-yellow-nect', 'YELLOW NECT\n$7.99/kg',   'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 18, 0, 2, 2, 1, NULL),
  ('pg18-flat-nect',   'FLAT NECT\n$12.99/kg',    'open_price', 12.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 18, 0, 4, 2, 1, NULL),
  ('pg18-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 18, 0, 10, 3, 1, NULL);

-- Page 19: Oranges
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg19-navel',       'NAVEL\n$4.99/kg',         'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 19, 0, 0, 2, 1, NULL),
  ('pg19-valencia',    'VALENCIA\n$3.99/kg',      'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 19, 0, 2, 2, 1, NULL),
  ('pg19-blood-orange','BLOOD ORANGE\n$7.99/kg',  'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 19, 0, 4, 2, 1, NULL),
  ('pg19-orange-bag',  'ORANGE BAG\n$5.99 ea',    'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 19, 0, 6, 2, 1, NULL),
  ('pg19-juice-orange','JUICE ORANGE\n$3.99/kg',  'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 19, 1, 0, 2, 1, NULL),
  ('pg19-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 19, 0, 10, 3, 1, NULL);

-- Page 20: Peaches
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg20-white-peach', 'WHITE PEACH\n$9.99/kg',   'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 20, 0, 0, 2, 1, NULL),
  ('pg20-yellow-peach','YELLOW PEACH\n$7.99/kg',  'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 20, 0, 2, 2, 1, NULL),
  ('pg20-flat-peach',  'FLAT PEACH\n$12.99/kg',   'open_price', 12.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 20, 0, 4, 2, 1, NULL),
  ('pg20-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 20, 0, 10, 3, 1, NULL);

-- Page 21: Pears
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg21-packham',     'PACKHAM\n$5.99/kg',       'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 21, 0, 0, 2, 1, NULL),
  ('pg21-bartlett',    'BARTLETT\n$5.99/kg',      'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 21, 0, 2, 2, 1, NULL),
  ('pg21-beurre-bosc', 'BEURRE BOSC\n$6.99/kg',  'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 21, 0, 4, 2, 1, NULL),
  ('pg21-nashi',       'NASHI\n$7.99/kg',         'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 21, 0, 6, 2, 1, NULL),
  ('pg21-corella',     'CORELLA\n$6.99/kg',       'open_price', 6.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 21, 1, 0, 2, 1, NULL),
  ('pg21-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 21, 0, 10, 3, 1, NULL);

-- Page 22: Plums
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg22-black-plum',  'BLACK PLUM\n$9.99/kg',    'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 22, 0, 0, 2, 1, NULL),
  ('pg22-red-plum',    'RED PLUM\n$9.99/kg',      'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 22, 0, 2, 2, 1, NULL),
  ('pg22-sugar-plum',  'SUGAR PLUM\n$12.99/kg',   'open_price', 12.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 22, 0, 4, 2, 1, NULL),
  ('pg22-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 22, 0, 10, 3, 1, NULL);

-- â•â•â• Pages 23-36: Vegetable category sub-pages â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- Page 23: Beetroot
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg23-beetroot-kg', 'BEETROOT KG\n$4.99/kg',   'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 23, 0, 0, 2, 1, NULL),
  ('pg23-beetroot-bch','BEETROOT BUNCH\n$3.99 ea','open_price', 3.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 23, 0, 2, 2, 1, NULL),
  ('pg23-baby-beet',   'BABY BEET\n$5.99 ea',    'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 23, 0, 4, 2, 1, NULL),
  ('pg23-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 23, 0, 10, 3, 1, NULL);

-- Page 24: Broccoli
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg24-broccoli-kg', 'BROCCOLI KG\n$5.99/kg',   'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 24, 0, 0, 2, 1, NULL),
  ('pg24-broccoli-ea', 'BROCCOLI EA\n$3.99 ea',   'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 24, 0, 2, 2, 1, NULL),
  ('pg24-broccolini',  'BROCCOLINI\n$4.99 ea',    'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 24, 0, 4, 2, 1, NULL),
  ('pg24-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 24, 0, 10, 3, 1, NULL);

-- Page 25: Cabbage
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg25-green-cab',   'GREEN CABBAGE\n$3.99 ea',  'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 25, 0, 0, 2, 1, NULL),
  ('pg25-red-cab',     'RED CABBAGE\n$4.99 ea',    'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 25, 0, 2, 2, 1, NULL),
  ('pg25-wombok',      'WOMBOK\n$3.99 ea',         'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 25, 0, 4, 2, 1, NULL),
  ('pg25-savoy',       'SAVOY\n$4.99 ea',          'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 25, 0, 6, 2, 1, NULL),
  ('pg25-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 25, 0, 10, 3, 1, NULL);

-- Page 26: Capsicum
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg26-red-cap',     'RED CAPSICUM\n$12.99/kg',  'open_price', 12.99, NULL, '#fff', '#1a3d2a', 1,  'grid', 26, 0, 0, 2, 1, NULL),
  ('pg26-green-cap',   'GREEN CAPSICUM\n$8.99/kg', 'open_price', 8.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 26, 0, 2, 2, 1, NULL),
  ('pg26-yellow-cap',  'YELLOW CAPSICUM\n$14.99/kg','open_price',14.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 26, 0, 4, 2, 1, NULL),
  ('pg26-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 26, 0, 10, 3, 1, NULL);

-- Page 27: Chillies
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg27-red-chilli',  'RED CHILLI\n$29.99/kg',    'open_price', 29.99, 'images/products/coles-8760314-zm.jpg', '#fff', '#1a3d2a', 1,  'grid', 27, 0, 0, 2, 1, NULL),
  ('pg27-green-chilli','GREEN CHILLI\n$24.99/kg',  'open_price', 24.99, 'images/remote/pexels-photo-16814702-940dcbf5bbe6.jpg', '#fff', '#1a3d2a', 2,  'grid', 27, 0, 2, 2, 1, NULL),
  ('pg27-birds-eye',   'BIRDS EYE\n$39.99/kg',    'open_price', 39.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 27, 0, 4, 2, 1, NULL),
  ('pg27-jalapeno',    'JALAPENO\n$29.99/kg',     'open_price', 29.99, NULL, '#fff', '#1a3d2a', 4,  'grid', 27, 0, 6, 2, 1, NULL),
  ('pg27-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 27, 0, 10, 3, 1, NULL);

-- Page 28: Garlic
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg28-garlic-kg',   'GARLIC KG\n$19.99/kg',    'open_price', 19.99, NULL, '#fff', '#1a3d2a', 1,  'grid', 28, 0, 0, 2, 1, NULL),
  ('pg28-garlic-ea',   'GARLIC EA\n$1.50 ea',     'open_price', 1.50,  NULL, '#fff', '#1a3d2a', 2,  'grid', 28, 0, 2, 2, 1, NULL),
  ('pg28-garlic-3pk',  'GARLIC 3-PACK\n$3.99 ea', 'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 28, 0, 4, 2, 1, NULL),
  ('pg28-elephant',    'ELEPHANT GARLIC\n$4.99 ea','open_price', 4.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 28, 0, 6, 2, 1, NULL),
  ('pg28-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 28, 0, 10, 3, 1, NULL);

-- Page 29: Lettuces
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg29-iceberg',     'ICEBERG\n$2.99 ea',       'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 29, 0, 0, 2, 1, NULL),
  ('pg29-cos',         'COS\n$2.99 ea',           'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 29, 0, 2, 2, 1, NULL),
  ('pg29-butter',      'BUTTER\n$3.50 ea',        'open_price', 3.50,  NULL, '#fff', '#1a3d2a', 3,  'grid', 29, 0, 4, 2, 1, NULL),
  ('pg29-oakleaf',     'OAK LEAF\n$3.50 ea',      'open_price', 3.50,  NULL, '#fff', '#1a3d2a', 4,  'grid', 29, 0, 6, 2, 1, NULL),
  ('pg29-rocket',      'ROCKET\n$3.99 ea',        'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 29, 1, 0, 2, 1, NULL),
  ('pg29-mixed-leaf',  'MIXED LEAF\n$3.99 ea',    'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 6,  'grid', 29, 1, 2, 2, 1, NULL),
  ('pg29-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 29, 0, 10, 3, 1, NULL);

-- Page 30: Mushrooms
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg30-cup-mush',    'CUP MUSHROOM\n$12.99/kg', 'open_price', 12.99, NULL, '#fff', '#1a3d2a', 1,  'grid', 30, 0, 0, 2, 1, NULL),
  ('pg30-flat-mush',   'FLAT MUSHROOM\n$14.99/kg', 'open_price', 14.99, NULL, '#fff', '#1a3d2a', 2,  'grid', 30, 0, 2, 2, 1, NULL),
  ('pg30-swiss-brown', 'SWISS BROWN\n$14.99/kg',  'open_price', 14.99, NULL, '#fff', '#1a3d2a', 3,  'grid', 30, 0, 4, 2, 1, NULL),
  ('pg30-oyster',      'OYSTER MUSH\n$19.99/kg',  'open_price', 19.99, NULL, '#fff', '#1a3d2a', 4,  'grid', 30, 0, 6, 2, 1, NULL),
  ('pg30-button',      'BUTTON MUSH\n$11.99/kg',  'open_price', 11.99, NULL, '#fff', '#1a3d2a', 5,  'grid', 30, 1, 0, 2, 1, NULL),
  ('pg30-punnet',      'MUSH PUNNET\n$4.99 ea',   'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 6,  'grid', 30, 1, 2, 2, 1, NULL),
  ('pg30-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 30, 0, 10, 3, 1, NULL);

-- Page 31: Onions
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg31-brown-onion', 'BROWN ONION\n$2.99/kg',   'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 31, 0, 0, 2, 1, NULL),
  ('pg31-red-onion',   'RED ONION\n$4.99/kg',     'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 31, 0, 2, 2, 1, NULL),
  ('pg31-white-onion', 'WHITE ONION\n$3.99/kg',   'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 31, 0, 4, 2, 1, NULL),
  ('pg31-spring-onion','SPRING ONION\n$2.50 ea',  'open_price', 2.50,  NULL, '#fff', '#1a3d2a', 4,  'grid', 31, 0, 6, 2, 1, NULL),
  ('pg31-onion-bag',   'ONION BAG\n$3.99 ea',     'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 31, 1, 0, 2, 1, NULL),
  ('pg31-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 31, 0, 10, 3, 1, NULL);

-- Page 32: Potatoes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg32-brushed',     'BRUSHED\n$3.99/kg',       'open_price', 3.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 1,  'grid', 32, 0, 0, 2, 1, NULL),
  ('pg32-washed',      'WASHED\n$4.99/kg',        'open_price', 4.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 2,  'grid', 32, 0, 2, 2, 1, NULL),
  ('pg32-kipfler',     'KIPFLER\n$6.99/kg',       'open_price', 6.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 3,  'grid', 32, 0, 4, 2, 1, NULL),
  ('pg32-desiree',     'DESIREE\n$4.99/kg',       'open_price', 4.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 4,  'grid', 32, 0, 6, 2, 1, NULL),
  ('pg32-chat',        'CHAT\n$5.99/kg',          'open_price', 5.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 5,  'grid', 32, 1, 0, 2, 1, NULL),
  ('pg32-potato-bag',  'POTATO BAG\n$4.99 ea',    'open_price', 4.99,  'images/products/coles-7141758-zm.jpg', '#fff', '#1a3d2a', 6,  'grid', 32, 1, 2, 2, 1, NULL),
  ('pg32-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 32, 0, 10, 3, 1, NULL);

-- Page 33: Pumpkins
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg33-butternut',   'BUTTERNUT\n$2.99/kg',     'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 33, 0, 0, 2, 1, NULL),
  ('pg33-jap',         'JAP\n$2.99/kg',           'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 33, 0, 2, 2, 1, NULL),
  ('pg33-kent',        'KENT\n$2.99/kg',          'open_price', 2.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 33, 0, 4, 2, 1, NULL),
  ('pg33-qld-blue',    'QLD BLUE\n$3.99/kg',      'open_price', 3.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 33, 0, 6, 2, 1, NULL),
  ('pg33-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 33, 0, 10, 3, 1, NULL);

-- Page 34: Sweet Potatoes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg34-gold-sp',     'GOLD\n$4.99/kg',          'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 34, 0, 0, 2, 1, NULL),
  ('pg34-purple-sp',   'PURPLE\n$5.99/kg',        'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 34, 0, 2, 2, 1, NULL),
  ('pg34-white-sp',    'WHITE\n$4.99/kg',         'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 34, 0, 4, 2, 1, NULL),
  ('pg34-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 34, 0, 10, 3, 1, NULL);

-- Page 35: Tomatoes
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg35-tomato-kg',   'TOMATO KG\n$5.99/kg',     'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 35, 0, 0, 2, 1, NULL),
  ('pg35-roma',        'ROMA\n$5.99/kg',          'open_price', 5.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 35, 0, 2, 2, 1, NULL),
  ('pg35-cherry',      'CHERRY\n$4.99 ea',        'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 35, 0, 4, 2, 1, NULL),
  ('pg35-truss',       'TRUSS\n$7.99/kg',         'open_price', 7.99,  NULL, '#fff', '#1a3d2a', 4,  'grid', 35, 0, 6, 2, 1, NULL),
  ('pg35-grape-tom',   'GRAPE\n$4.99 ea',         'open_price', 4.99,  NULL, '#fff', '#1a3d2a', 5,  'grid', 35, 1, 0, 2, 1, NULL),
  ('pg35-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 35, 0, 10, 3, 1, NULL);

-- Page 36: Zucchini
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg36-green-zuc',   'GREEN ZUCCHINI\n$5.99/kg','open_price', 5.99,  NULL, '#fff', '#1a3d2a', 1,  'grid', 36, 0, 0, 2, 1, NULL),
  ('pg36-yellow-zuc',  'YELLOW ZUCCHINI\n$7.99/kg','open_price',7.99,  NULL, '#fff', '#1a3d2a', 2,  'grid', 36, 0, 2, 2, 1, NULL),
  ('pg36-baby-zuc',    'BABY ZUCCHINI\n$9.99/kg', 'open_price', 9.99,  NULL, '#fff', '#1a3d2a', 3,  'grid', 36, 0, 4, 2, 1, NULL),
  ('pg36-back',        'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 36, 0, 10, 3, 1, NULL);

-- â•â•â• Page 6: Grocery â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id, category_filter) VALUES
  ('pg6-grocery',      'GROCERY',                   'section',    0,     NULL, '#fff', '#6699cc', 1,  'grid', 6, 0, 0, 1, 1, NULL, 'Grocery'),
  ('pg6-grocery-open', 'GROCERY OPEN PRICE',        'open_price', 0,     NULL, '#fff', '#334155', 2,  'grid', 6, 0, 1, 1, 1, NULL, NULL);
INSERT OR IGNORE INTO keyboard_buttons (id, label, type, price, image, color, bg_color, sort_order, position, page, grid_row, grid_col, col_span, row_span, parent_id) VALUES
  ('pg6-confectionary','CONFECTIONARY',             'open_price', 0,     NULL, '#fff', '#1a3d2a', 3,  'grid', 6, 0, 2, 1, 1, NULL),
  ('pg6-chips',        'CHIPS',                     'open_price', 0,     NULL, '#fff', '#1a3d2a', 4,  'grid', 6, 0, 3, 1, 1, NULL),
  ('pg6-pies',         'SIMPLY PIES',               'open_price', 0,     NULL, '#fff', '#1a3d2a', 5,  'grid', 6, 0, 4, 1, 1, NULL),
  ('pg6-water',        'WATER 12PK',                'open_price', 0,     NULL, '#fff', '#1a3d2a', 6,  'grid', 6, 0, 5, 1, 1, NULL),
  ('pg6-salmon',       'SALMON PIECES',             'open_price', 0,     NULL, '#fff', '#1a3d2a', 7,  'grid', 6, 1, 0, 1, 1, NULL),
  ('pg6-salmon-fillet','SALMON FILLET',             'open_price', 0,     NULL, '#fff', '#1a3d2a', 8,  'grid', 6, 1, 1, 1, 1, NULL),
  ('pg6-snapper',      'SNAPPER',                   'open_price', 0,     NULL, '#fff', '#1a3d2a', 9,  'grid', 6, 1, 2, 1, 1, NULL),
  ('pg6-snapper-fillet','SNAPPER FILLET',           'open_price', 0,     NULL, '#fff', '#1a3d2a', 10, 'grid', 6, 1, 3, 1, 1, NULL),
  ('pg6-fresh-juice',  'FRESH JUICE 500ML',         'open_price', 0,     NULL, '#fff', '#1a3d2a', 11, 'grid', 6, 1, 4, 1, 1, NULL),
  ('pg6-juice-1l',     'JUICE 1L',                  'open_price', 0,     NULL, '#fff', '#1a3d2a', 12, 'grid', 6, 1, 5, 1, 1, NULL),
  ('pg6-lemon-juice',  'LEMON JUICE 500ML',         'open_price', 0,     NULL, '#fff', '#1a3d2a', 13, 'grid', 6, 1, 6, 1, 1, NULL),
  ('pg6-spices',       'ASSORTED SPICES',           'open_price', 0,     NULL, '#fff', '#1a3d2a', 14, 'grid', 6, 2, 0, 1, 1, NULL),
  ('pg6-pickles',      'MIXED PICKLES',             'open_price', 0,     NULL, '#fff', '#1a3d2a', 15, 'grid', 6, 2, 1, 1, 1, NULL),
  ('pg6-alt-milk',     'ALTERNATIVE MILK',          'open_price', 0,     NULL, '#fff', '#1a3d2a', 16, 'grid', 6, 2, 2, 1, 1, NULL),
  ('pg6-back',         'BACK',                      'back_home',  0,     NULL, '#000', '#22c55e', 90, 'grid', 6, 0, 7, 3, 1, NULL);
