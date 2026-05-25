/*
 * Rebuild Supabase from the local YieldPOS SQLite database.
 *
 * Usage:
 *   node scripts/upload-sqlite-to-supabase.js
 *   node scripts/upload-sqlite-to-supabase.js path/to/crisp-pos.sqlite
 *
 * Requires .env.supabase.local with SUPABASE_DB_URL.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const envPath = path.join(root, '.env.supabase.local')
const dbPath = path.resolve(process.argv[2] || path.join(root, 'db', 'crisp-pos.sqlite'))

const coreTables = [
  'categories',
  'products',
  'specials',
  'deals',
  'deal_products',
  'staff',
  'transactions',
  'transaction_items',
  'payments',
  'cash_drawer',
  'keyboard_pages',
  'keyboard_buttons',
  'settings',
  'audit_log',
  'deleted_records'
]

const uploadOrder = [
  'staff',
  'categories',
  'products',
  'deals',
  'deal_products',
  'specials',
  'keyboard_pages',
  'keyboard_buttons',
  'settings',
  'transactions',
  'transaction_items',
  'payments',
  'cash_drawer',
  'audit_log',
  'deleted_records'
]

const rebuildSchemaSql = `
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
`

function loadEnv (file) {
  const out = {}
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

function sqlIdent (name) {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

function boolValue (value) {
  return value === true || value === 1 || value === '1'
}

function nullableDate (value) {
  if (value === undefined || value === null || value === '') return null
  return value
}

function parseJsonObject (value) {
  if (value && typeof value === 'object') return value
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function rowsFromSqlite (db, table) {
  const res = db.exec(`SELECT * FROM ${sqlIdent(table)}`)
  if (!res.length) return []
  const cols = res[0].columns
  return res[0].values.map(values => Object.fromEntries(cols.map((col, idx) => [col, values[idx]])))
}

function mapRow (table, row) {
  if (table === 'categories') {
    return {
      id: row.id,
      name: row.name,
      sort_order: row.sort_order || 0,
      colour: row.colour || '#4fbd77',
      active: boolValue(row.active),
      updated_at: nullableDate(row.updated_at),
      family: row.family || ''
    }
  }
  if (table === 'products') {
    return {
      id: row.id,
      barcode: row.barcode || null,
      plu: row.plu || null,
      name: row.name,
      category_id: row.category_id || null,
      price: row.price || 0,
      cost_price: row.cost_price || 0,
      unit: row.unit || 'each',
      tax_rate: row.tax_rate ?? 0.10,
      track_stock: boolValue(row.track_stock),
      stock_qty: row.stock_qty || 0,
      active: boolValue(row.active),
      image_url: row.image_url || null,
      updated_at: nullableDate(row.updated_at),
      open_price: boolValue(row.open_price)
    }
  }
  if (table === 'specials') {
    return {
      id: row.id,
      product_id: row.product_id,
      special_price: row.special_price || 0,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      active: boolValue(row.active),
      updated_at: nullableDate(row.updated_at)
    }
  }
  if (table === 'deals') {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config: parseJsonObject(row.config),
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      active: boolValue(row.active),
      updated_at: nullableDate(row.updated_at)
    }
  }
  if (table === 'deal_products') {
    return {
      deal_id: row.deal_id,
      product_id: row.product_id,
      role: row.role || 'trigger'
    }
  }
  if (table === 'staff') {
    return {
      id: row.id,
      name: row.name,
      pin_hash: row.pin || row.pin_hash || '',
      role: row.role || 'cashier',
      active: boolValue(row.active),
      updated_at: nullableDate(row.updated_at)
    }
  }
  if (table === 'transactions') {
    return {
      id: row.id,
      register_id: row.register_id || 'REG1',
      staff_id: row.staff_id || null,
      customer_name: row.customer_name || null,
      subtotal: row.subtotal || 0,
      tax: row.tax || 0,
      discount: row.discount || 0,
      total: row.total || 0,
      status: row.status || 'completed',
      created_at: nullableDate(row.created_at)
    }
  }
  if (table === 'transaction_items') {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      product_id: row.product_id || null,
      name: row.name,
      qty: row.qty || 0,
      unit_price: row.unit_price || 0,
      discount: row.discount || 0,
      line_total: row.line_total || 0,
      tax: row.tax || 0,
      deal_id: row.deal_id || null
    }
  }
  if (table === 'payments') {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      method: row.method,
      amount: row.amount || 0,
      reference: row.reference || null,
      created_at: nullableDate(row.created_at)
    }
  }
  if (table === 'cash_drawer') {
    return {
      id: row.id,
      register_id: row.register_id || 'REG1',
      staff_id: row.staff_id || null,
      action: row.action,
      amount: row.amount || 0,
      note: row.note || null,
      created_at: nullableDate(row.created_at)
    }
  }
  if (table === 'keyboard_pages') {
    return {
      page: row.page,
      name: row.name || `Page ${row.page}`,
      cols: row.cols || 13,
      rows: row.rows || 7
    }
  }
  if (table === 'keyboard_buttons') {
    return {
      id: row.id,
      label: row.label,
      type: row.type,
      price: row.price || 0,
      image: row.image || null,
      color: row.color || '#fff',
      bg_color: row.bg_color || '#1a3d2a',
      parent_id: row.parent_id || null,
      category_filter: row.category_filter || null,
      alpha_range: row.alpha_range || null,
      sort_order: row.sort_order || 0,
      position: row.position || 'grid',
      page: row.page || 1,
      grid_row: row.grid_row || 0,
      grid_col: row.grid_col || 0,
      col_span: row.col_span || 1,
      row_span: row.row_span || 1,
      product_id: row.product_id || null,
      active: boolValue(row.active),
      updated_at: nullableDate(row.updated_at),
      image_scale: row.image_scale || 100
    }
  }
  if (table === 'settings') {
    return {
      key: row.key,
      value: row.value ?? null
    }
  }
  if (table === 'audit_log') {
    return {
      id: row.id,
      staff_id: row.staff_id || null,
      staff_name: row.staff_name || null,
      action: row.action,
      detail: row.detail || null,
      created_at: nullableDate(row.created_at)
    }
  }
  if (table === 'deleted_records') {
    return {
      table_name: row.table_name,
      record_id: row.record_id,
      deleted_at: nullableDate(row.deleted_at)
    }
  }
  return row
}

async function insertRows (client, table, rows) {
  if (!rows.length) return 0
  const cols = Object.keys(rows[0])
  const chunkSize = Math.max(1, Math.floor(60000 / cols.length))
  let inserted = 0
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
    const values = []
    const placeholders = chunk.map((row, rowIdx) => {
      const inner = cols.map((col, colIdx) => {
        values.push(row[col] === undefined ? null : row[col])
        return `$${rowIdx * cols.length + colIdx + 1}`
      })
      return `(${inner.join(', ')})`
    })
    const sql = `INSERT INTO public.${sqlIdent(table)} (${cols.map(sqlIdent).join(', ')}) VALUES ${placeholders.join(', ')}`
    await client.query(sql, values)
    inserted += chunk.length
  }
  return inserted
}

async function backupRemote (client, env) {
  const tableRows = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)
  const views = await client.query(`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)
  const schema = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)
  const data = {}
  for (const { table_name: table } of tableRows.rows) {
    const rows = await client.query(`SELECT * FROM public.${sqlIdent(table)}`)
    data[table] = rows.rows
  }
  const backupDir = path.join(root, 'backups', 'supabase')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(backupDir, `supabase-backup-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({
    backedUpAt: new Date().toISOString(),
    projectRef: env.SUPABASE_PROJECT_REF || null,
    schema: schema.rows,
    views: views.rows,
    data
  }, null, 2))
  return file
}

async function configureRlsAndRealtime (client) {
  for (const table of coreTables) {
    await client.query(`ALTER TABLE public.${sqlIdent(table)} ENABLE ROW LEVEL SECURITY`)
    await client.query(`CREATE POLICY ${sqlIdent(`${table}_all_access`)} ON public.${sqlIdent(table)} FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`)
  }

  for (const table of ['products', 'categories', 'specials', 'deals', 'deal_products', 'keyboard_buttons', 'keyboard_pages', 'staff', 'settings']) {
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${sqlIdent(table)}`)
    } catch (err) {
      if (!/already.*member|does not exist|undefined/i.test(err.message)) throw err
    }
  }
}

async function main () {
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}`)
  if (!fs.existsSync(dbPath)) throw new Error(`Missing SQLite database ${dbPath}`)

  const env = loadEnv(envPath)
  if (!env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL missing from .env.supabase.local')

  const SQL = await initSqlJs()
  const sqlite = new SQL.Database(fs.readFileSync(dbPath))
  const localData = {}
  for (const table of uploadOrder) {
    localData[table] = rowsFromSqlite(sqlite, table).map(row => mapRow(table, row))
  }

  const client = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  })
  await client.connect()

  const backupFile = await backupRemote(client, env)
  console.log(`Backed up existing Supabase data to ${backupFile}`)

  await client.query('BEGIN')
  try {
    await client.query(rebuildSchemaSql)
    const inserted = {}
    for (const table of uploadOrder) {
      inserted[table] = await insertRows(client, table, localData[table])
    }
    await configureRlsAndRealtime(client)
    await client.query('COMMIT')
    console.log(JSON.stringify({ uploadedFrom: dbPath, inserted }, null, 2))
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    await client.end()
    sqlite.close()
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
