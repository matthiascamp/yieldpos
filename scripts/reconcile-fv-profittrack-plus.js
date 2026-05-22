const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.join(__dirname, '..')
const runtimeDbPath = process.argv[2] || ''
const bundledDbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const VERSION = '2026-05-21-profittrack-plu-reconcile'

const BUTTON_COLS = ['id','label','type','price','image','color','bg_color','parent_id','category_filter','alpha_range','sort_order','position','page','grid_row','grid_col','col_span','row_span','product_id','active']

function readArray(text, name) {
  const start = text.indexOf(`const ${name} = `)
  if (start < 0) throw new Error(`Could not find ${name}`)
  const open = text.indexOf('[', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) {
        return {
          value: Function('DEFAULT', 'GREEN', 'PURPLE', 'YELLOW', `return (${text.slice(open, i + 1)})`)('#1B4332', '#65a30d', '#6b21a8', '#c4b800'),
          start: open,
          end: i + 1,
        }
      }
    }
  }
  throw new Error(`Could not parse ${name}`)
}

function replaceArray(text, parsed, value) {
  return text.slice(0, parsed.start) + JSON.stringify(value, null, 2) + text.slice(parsed.end)
}

function loadProfitTrackPages() {
  const text = fs.readFileSync(path.join(root, '_rebuild_subpages.js'), 'utf8')
  return readArray(text, 'pages').value
}

function cleanLabel(label) {
  return String(label || '')
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(BUCKET|GREEN|OUTSIDE|FROM|DARK|ROUGH|SMOOTH|ROUND|LONG|STRAIGHT|THICK|STUBBY|STRIPY|SPOTTY|SMALL|LARGE|MEDIUM|VERY|FLAT|BIG|HOLE|BLUEISH|SKIN|SHAPE|STICKER|ZESPRI|ASIAN)\b/g, ' ')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\b(KG|EA|EACH|BAG|BAGGED)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function productName(label) {
  return String(label || '')
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+\b(KG|EA|EACH|100G)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

function unitFor(label) {
  return /\bKG\b|\/kg/i.test(label) ? 'kg' : (/\b100G\b|\/100g/i.test(label) ? '100g' : 'each')
}

function categoryForPage(page) {
  return page >= 24 && page <= 36 ? 'cat-veg' : 'cat-fruit'
}

function desiredMappings() {
  const mappings = []
  for (const pg of loadProfitTrackPages()) {
    for (let i = 0; i < pg.buttons.length; i++) {
      const src = pg.buttons[i]
      mappings.push({
        page: pg.page,
        fallbackId: `pg${pg.page}-btn${i}`,
        label: src.label,
        clean: cleanLabel(src.label),
        plu: String(src.plu || '').trim(),
      })
    }
  }
  return mappings
}

function findButton(buttons, mapping) {
  const byId = buttons.find(b => b.id === mapping.fallbackId)
  if (byId) return byId
  const pageButtons = buttons.filter(b => Number(b.page) === Number(mapping.page) && b.type !== 'back_home')
  const exact = pageButtons.find(b => cleanLabel(b.label) === mapping.clean)
  if (exact) return exact
  const scored = pageButtons
    .map(b => {
      const a = new Set(cleanLabel(b.label).split(' ').filter(Boolean))
      const c = mapping.clean.split(' ').filter(Boolean)
      const score = c.filter(t => a.has(t)).length
      return { b, score }
    })
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.b || null
}

function patchSeed(filePath, scopePages) {
  let text = fs.readFileSync(filePath, 'utf8')
  text = text.replace(/const VERSION = "[^"]+"/, `const VERSION = "${VERSION}"`)
  const parsed = readArray(text, 'buttons')
  const buttons = parsed.value
  const maps = desiredMappings().filter(m => scopePages.has(Number(m.page)))
  const pluCounts = new Map()
  for (const m of maps) pluCounts.set(m.plu, (pluCounts.get(m.plu) || 0) + 1)
  let updated = 0
  const misses = []
  for (const m of maps) {
    const b = findButton(buttons, m)
    if (!b) {
      misses.push(`${m.page}:${m.label}`)
      continue
    }
    b.category_filter = m.plu
    b.product_id = `p-kb-${b.id}`
    b.type = b.type === 'back_home' ? b.type : 'product'
    b.price = 0
    updated++
  }
  text = replaceArray(text, parsed, buttons)
  fs.writeFileSync(filePath, text)
  return { filePath, updated, misses }
}

function dbRows(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function updateDb(SQL, dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return { dbPath, skipped: true }
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const buttons = dbRows(db, `SELECT ${BUTTON_COLS.join(',')} FROM keyboard_buttons WHERE active = 1`)
  const maps = desiredMappings()
  const matched = []
  for (const m of maps) {
    const b = findButton(buttons, m)
    if (b) matched.push({ mapping: m, button: b })
  }

  const pluCounts = new Map()
  for (const x of matched) pluCounts.set(x.mapping.plu, (pluCounts.get(x.mapping.plu) || 0) + 1)

  const updateButton = db.prepare("UPDATE keyboard_buttons SET type = 'product', price = 0, category_filter = ?1, product_id = ?2, updated_at = datetime('now') WHERE id = ?3")
  const clearPlu = db.prepare("UPDATE products SET plu = NULL, barcode = NULL, updated_at = datetime('now') WHERE (plu = ?1 OR barcode = ?1) AND id != ?2")
  const upsert = db.prepare(`INSERT INTO products
    (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, open_price, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, 0.00, 0, 0, 1, ?7, 1, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      barcode = excluded.barcode,
      plu = excluded.plu,
      name = excluded.name,
      category_id = excluded.category_id,
      price = 0,
      unit = excluded.unit,
      tax_rate = 0.00,
      active = 1,
      image_url = COALESCE(products.image_url, excluded.image_url),
      open_price = 1,
      updated_at = datetime('now')`)

  let updated = 0
  let duplicatePluButtons = 0
  for (const { mapping, button } of matched) {
    const productId = `p-kb-${button.id}`
    const uniquePlu = pluCounts.get(mapping.plu) === 1
    const dbPlu = uniquePlu ? mapping.plu : null
    if (uniquePlu) clearPlu.run([mapping.plu, productId])
    else duplicatePluButtons++
    upsert.run([
      productId,
      dbPlu,
      dbPlu,
      productName(button.label || mapping.label),
      categoryForPage(Number(button.page)),
      unitFor(button.label || mapping.label),
      button.image || null,
    ])
    updateButton.run([mapping.plu, productId, button.id])
    updated++
  }
  updateButton.free()
  clearPlu.free()
  upsert.free()
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('kb_subpages_ver', ?1)", [VERSION])
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('kb_catpages_ver', ?1)", [VERSION])
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db.close()
  return { dbPath, updated, duplicatePluButtons }
}

async function main() {
  const seedResults = [
    patchSeed(path.join(root, 'db', 'keyboard-subpages.js'), new Set([7,9,10,11,12,13,14,15,16,17,18,19,20,21,22,25,26,27,28,29,30,31,32,33,34,36])),
  ]
  const SQL = await initSqlJs()
  const dbResults = [updateDb(SQL, bundledDbPath)]
  if (runtimeDbPath) dbResults.push(updateDb(SQL, runtimeDbPath))
  console.log(JSON.stringify({ seedResults, dbResults }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
