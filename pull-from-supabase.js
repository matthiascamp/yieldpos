#!/usr/bin/env node
// Pull all products + categories from Supabase into local SQLite DB

const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_PATH = path.join(process.env.APPDATA, 'crisp-pos', 'crisp-pos.sqlite')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
  process.exit(1)
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
}

async function supaGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchAllProducts() {
  let all = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&offset=${from}&limit=${pageSize}`, { headers })
    const data = await res.json()
    if (!data.length) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  console.log('=== Pull Supabase → Local SQLite ===\n')

  // Load local DB
  console.log('Loading local DB:', DB_PATH)
  const SQL = await initSqlJs()
  const buf = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buf)

  // Fetch categories
  console.log('Fetching categories from Supabase...')
  const categories = await supaGet('categories', 'select=*')
  console.log(`  ${categories.length} categories`)

  // Fetch all products
  console.log('Fetching products from Supabase...')
  const products = await fetchAllProducts()
  console.log(`  ${products.length} products`)
  console.log(`  ${products.filter(p => p.image_url).length} with images`)

  // Insert categories
  console.log('\nInserting categories...')
  for (const c of categories) {
    db.run(`INSERT OR REPLACE INTO categories (id, name, sort_order, colour, active, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      [c.id, c.name, c.sort_order || 0, c.colour || '#4fbd77', c.active ? 1 : 0,
       c.updated_at || new Date().toISOString()])
  }
  console.log(`  ✓ ${categories.length} categories`)

  // Insert products
  console.log('Inserting products...')
  let withImg = 0
  for (const p of products) {
    if (p.image_url) withImg++
    db.run(`INSERT OR REPLACE INTO products (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      [p.id, p.barcode || null, p.plu || null, p.name, p.category_id || null,
       p.price, p.cost_price || 0, p.unit || 'each', p.tax_rate ?? 0.10,
       p.track_stock ? 1 : 0, p.stock_qty || 0, p.active ? 1 : 0,
       p.image_url || null, p.updated_at || new Date().toISOString()])
  }
  console.log(`  ✓ ${products.length} products (${withImg} with images)`)

  // Save
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  db.close()

  console.log('\n=== DONE ===')
  console.log(`Local DB updated: ${DB_PATH}`)
  console.log('Restart the app to see all products.')
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
