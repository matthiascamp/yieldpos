const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const dbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const productsPath = path.join(root, 'products.json')
const keyboardPath = path.join(root, 'keyboard-layout.json')
const posRoot = path.join(root, 'pos')

function one (db, sql, params = []) {
  const result = db.exec(sql, params)[0]
  return result?.values?.[0]?.[0]
}

function all (db, sql, params = []) {
  const result = db.exec(sql, params)[0]
  return result ? result.values : []
}

function columns (db, table) {
  return all(db, `PRAGMA table_info(${table})`).map(row => row[1])
}

function localImageExists (ref) {
  if (!ref || typeof ref !== 'string') return true
  if (/^(https?:|data:|file:)/i.test(ref)) return true
  const clean = ref.replace(/^\/+/, '').replace(/\\/g, '/')
  if (!clean.startsWith('images/')) return true
  return fs.existsSync(path.join(posRoot, clean))
}

function addIssue (issues, severity, code, detail) {
  issues.push({ severity, code, detail })
}

async function main () {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const productsSeed = JSON.parse(fs.readFileSync(productsPath, 'utf8'))
  const keyboardSeed = JSON.parse(fs.readFileSync(keyboardPath, 'utf8'))
  const issues = []

  const integrity = one(db, 'PRAGMA integrity_check')
  if (integrity !== 'ok') addIssue(issues, 'high', 'sqlite_integrity', integrity)

  const requiredColumns = [
    ['products', ['id', 'name', 'plu', 'price', 'unit', 'active', 'image_url', 'open_price']],
    ['keyboard_buttons', ['id', 'label', 'type', 'price', 'image', 'page', 'grid_row', 'grid_col', 'col_span', 'row_span', 'active', 'product_id']],
    ['keyboard_pages', ['page', 'name', 'cols', 'rows']]
  ]
  for (const [table, required] of requiredColumns) {
    const present = columns(db, table)
    for (const col of required) {
      if (!present.includes(col)) addIssue(issues, 'high', 'missing_column', `${table}.${col}`)
    }
  }

  const seedProducts = Array.isArray(productsSeed) ? productsSeed : (productsSeed.products || [])
  const dbProductIds = new Set(all(db, 'SELECT id FROM products').map(row => row[0]))
  for (const product of seedProducts) {
    if (product.id && !dbProductIds.has(product.id)) addIssue(issues, 'medium', 'missing_seed_product', `${product.id} ${product.name || ''}`)
  }

  const dbKeyboardIds = new Set(all(db, 'SELECT id FROM keyboard_buttons').map(row => row[0]))
  for (const button of (keyboardSeed.buttons || [])) {
    if (button.id && !dbKeyboardIds.has(button.id)) addIssue(issues, 'high', 'missing_keyboard_button_from_seed', `${button.id} ${button.label || ''}`)
  }

  const dbPages = new Set(all(db, 'SELECT page FROM keyboard_pages').map(row => String(row[0])))
  for (const page of (keyboardSeed.pages || [])) {
    if (!dbPages.has(String(page.page))) addIssue(issues, 'high', 'missing_keyboard_page_from_seed', `${page.page} ${page.name || ''}`)
  }

  for (const row of all(db, `SELECT kb.id,kb.product_id FROM keyboard_buttons kb LEFT JOIN products p ON p.id = kb.product_id WHERE kb.product_id IS NOT NULL AND p.id IS NULL`)) {
    addIssue(issues, 'high', 'broken_keyboard_product_link', `${row[0]} -> ${row[1]}`)
  }
  for (const row of all(db, `SELECT p.id,p.category_id FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.category_id IS NOT NULL AND p.category_id != '' AND c.id IS NULL`)) {
    addIssue(issues, 'medium', 'broken_product_category_link', `${row[0]} -> ${row[1]}`)
  }
  for (const row of all(db, `SELECT plu, COUNT(*) FROM products WHERE plu IS NOT NULL AND TRIM(plu) != '' GROUP BY plu HAVING COUNT(*) > 1`)) {
    addIssue(issues, 'high', 'duplicate_product_plu', `${row[0]} (${row[1]})`)
  }
  for (const row of all(db, `SELECT barcode, COUNT(*) FROM products WHERE barcode IS NOT NULL AND TRIM(barcode) != '' GROUP BY barcode HAVING COUNT(*) > 1`)) {
    addIssue(issues, 'high', 'duplicate_product_barcode', `${row[0]} (${row[1]})`)
  }
  for (const row of all(db, `SELECT id,image FROM keyboard_buttons WHERE image IS NOT NULL AND TRIM(image) != ''`)) {
    if (!localImageExists(row[1])) addIssue(issues, 'medium', 'missing_keyboard_image_file', `${row[0]} -> ${row[1]}`)
  }
  for (const row of all(db, `SELECT id,image_url FROM products WHERE image_url IS NOT NULL AND TRIM(image_url) != ''`)) {
    if (!localImageExists(row[1])) addIssue(issues, 'medium', 'missing_product_image_file', `${row[0]} -> ${row[1]}`)
  }

  const activeProductButtons = one(db, "SELECT COUNT(*) FROM keyboard_buttons WHERE active=1 AND type='product'") || 0
  const activeOpenPriceButtons = one(db, "SELECT COUNT(*) FROM keyboard_buttons WHERE active=1 AND type='open_price'") || 0
  if (activeOpenPriceButtons > activeProductButtons) {
    addIssue(issues, 'high', 'keyboard_open_price_dominates', `${activeOpenPriceButtons} open_price vs ${activeProductButtons} product active buttons`)
  }

  const counts = {
    products: one(db, 'SELECT COUNT(*) FROM products'),
    categories: one(db, 'SELECT COUNT(*) FROM categories'),
    keyboard_buttons: one(db, 'SELECT COUNT(*) FROM keyboard_buttons'),
    keyboard_pages: one(db, 'SELECT COUNT(*) FROM keyboard_pages'),
    settings: one(db, 'SELECT COUNT(*) FROM settings'),
    active_keyboard_product_buttons: activeProductButtons,
    active_keyboard_open_price_buttons: activeOpenPriceButtons
  }

  console.log(JSON.stringify({ counts, issues }, null, 2))
  if (issues.some(issue => issue.severity === 'high' || issue.severity === 'medium')) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
