const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.join(__dirname, '..')
const dbPath = process.argv[2] || path.join(root, 'db', 'crisp-pos.sqlite')

const BUTTON_COLS = 'id,label,type,page,category_filter,product_id,image,active'

function norm(s) {
  return String(s || '')
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\b(kg|ea|each|100g|button|open|price|bucket|bag|bunch|from|outside|green|red|white|yellow|black|small|large|medium)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function rows(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const out = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

function localImageExists(value) {
  if (!value || /^https?:\/\//i.test(value) || /^data:/i.test(value)) return true
  return fs.existsSync(path.join(root, 'pos', value.replace(/^pos[\\/]/, '')))
    || fs.existsSync(path.join(root, value))
}

async function main() {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const findings = []

  const dupPlus = rows(db, `
    SELECT plu, COUNT(*) AS count, group_concat(name, ' | ') AS names
    FROM products
    WHERE active = 1 AND plu IS NOT NULL AND plu != ''
    GROUP BY plu
    HAVING COUNT(*) > 1
  `)
  for (const d of dupPlus) findings.push({ severity: 'high', type: 'duplicate_product_plu', ...d })

  const productButtons = rows(db, `
    SELECT kb.${BUTTON_COLS.replaceAll(',', ',kb.')}, p.name AS product_name, p.plu AS product_plu, p.active AS product_active
    FROM keyboard_buttons kb
    LEFT JOIN products p ON p.id = kb.product_id
    WHERE kb.active = 1 AND kb.type = 'product'
  `)
  for (const b of productButtons) {
    if (!b.product_id) findings.push({ severity: 'high', type: 'product_button_missing_product_id', id: b.id, label: b.label, page: b.page })
    else if (!b.product_name) findings.push({ severity: 'high', type: 'product_button_broken_product_id', id: b.id, label: b.label, product_id: b.product_id, page: b.page })
    else if (Number(b.product_active) !== 1) findings.push({ severity: 'high', type: 'product_button_inactive_product', id: b.id, label: b.label, product_id: b.product_id, page: b.page })

    if (b.category_filter && b.product_plu && String(b.category_filter) !== String(b.product_plu)) {
      findings.push({ severity: 'medium', type: 'button_plu_differs_from_product_plu', id: b.id, label: b.label, button_plu: b.category_filter, product_plu: b.product_plu, product_name: b.product_name })
    }

    const buttonName = norm(b.label)
    const productName = norm(b.product_name)
    if (buttonName && productName) {
      const buttonTokens = new Set(buttonName.split(' ').filter(Boolean))
      const productTokens = productName.split(' ').filter(Boolean)
      const overlap = productTokens.filter(t => buttonTokens.has(t)).length
      if (overlap === 0) findings.push({ severity: 'high', type: 'keyboard_product_name_mismatch', id: b.id, label: b.label, product_name: b.product_name, page: b.page })
    }
  }

  const missingAssets = rows(db, `SELECT id,label,page,image FROM keyboard_buttons WHERE active=1 AND image IS NOT NULL AND image != ''`)
    .filter(r => !localImageExists(r.image))
  for (const m of missingAssets) findings.push({ severity: 'medium', type: 'missing_local_keyboard_image', ...m })

  const remoteImages = rows(db, `
    SELECT 'keyboard_buttons' AS table_name, id, label AS name, image AS url FROM keyboard_buttons WHERE active=1 AND image LIKE 'http%'
    UNION ALL
    SELECT 'products' AS table_name, id, name, image_url AS url FROM products WHERE active=1 AND image_url LIKE 'http%'
  `)
  for (const r of remoteImages) findings.push({ severity: 'medium', type: 'remote_image_dependency', ...r })

  const pageLinks = rows(db, `
    SELECT kb.id,kb.label,kb.parent_id,kp.page AS target_page
    FROM keyboard_buttons kb
    LEFT JOIN keyboard_pages kp ON kp.page = CAST(kb.parent_id AS INTEGER)
    WHERE kb.active=1 AND kb.type='page_link'
  `)
  for (const p of pageLinks) {
    if (!p.parent_id || p.target_page == null) findings.push({ severity: 'high', type: 'broken_page_link', ...p })
  }

  const required = ['main.js', 'preload.js', 'lan-sync.js', 'linkly.js', 'pos/index.html', 'pos/admin.html', 'pos/customer.html', 'db/crisp-pos.sqlite', 'package.json']
  for (const rel of required) {
    if (!fs.existsSync(path.join(root, rel))) findings.push({ severity: 'high', type: 'missing_required_file', file: rel })
  }

  db.close()
  const counts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1
    acc.total++
    return acc
  }, { total: 0 })
  console.log(JSON.stringify({ dbPath, counts, findings }, null, 2))
  if (findings.some(f => f.severity === 'high')) process.exitCode = 2
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
