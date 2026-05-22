const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.join(__dirname, '..')
const sourceDir = path.join(root, 'new photos')
const assetDir = path.join(root, 'pos', 'images', 'products')
const bundledDbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const runtimeDbPath = process.argv[2] || ''

const VERSION_SUFFIX = '2026-05-21-veg-photo-sections'
const GREEN = '#22c55e'

const updates = [
  ['herbs.png', ['pg5-herbs']],
  ['kale.png', ['pg5-kale']],
  ['lettuce bag.png', ['pg5-lettuce-bags']],
  ['cos lettuce.png', ['pg29-btn1']],
  ['button mushroom.png', ['pg5-mushrooms', 'pg30-btn0']],
  ['olives.png', ['pg5-olives']],
  ['parsnip.png', ['pg5-parsnip']],
  ['radish bunch.png', ['pg5-radish']],
  ['sugar snap peas.png', ['pg5-sugar-snap']],
  ['snow peas.png', ['pg5-snow-peas']],
  ['red sweet potato.png', ['pg34-btn1']],
  ['white sweet potato.png', ['pg34-btn2']],
  ['spring onion.png', ['pg31-btn7']],
  ['pickling onion.png', ['pg31-btn6']],
  ['red onion bag.png', ['pg31-btn4']],
  ['2kg brown onion bag.png', ['pg31-btn0']],
  ['jarra pumpkin.png', ['pg33-btn2', 'pg33-btn5', 'pg33-btn8']],
  ['3kg potato bag.png', ['pg32-btn2', 'pg32-red-chats']],
  ['dutch cream potato.png', ['pg32-btn5']],
  ['washed potato red.png', ['pg32-btn4']],
  ['white washed potato.png', ['pg32-btn1']],
  ['cabbage.png', ['pg4-cabbage', 'pg25-green-cabbage', 'pg25-drumhead']],
  ['red cabbage.png', ['pg25-red-cabbage']],
  ['chinese cabbage or wombok.png', ['pg25-wombok']],
  ['sugarloaf cabbage.png', ['pg25-sugarloaf']],
  ['red capsicum.png', ['pg4-capsicum', 'pg26-red-capsicum']],
  ['green capsicum.png', ['pg26-green-capsicum']],
  ['yellow capsicum.png', ['pg26-yellow-capsicum']],
  ['australian garlic.png', ['pg4-garlic', 'pg28-australian-garlic']],
  ['mexican garlic.png', ['pg28-mexican-garlic']],
  ['garlic bag.png', ['pg28-garlic-bag']],
]

const pageDefs = [
  { page: 25, name: 'Cabbage', cols: 13, rows: 6 },
  { page: 26, name: 'Capsicum', cols: 13, rows: 6 },
  { page: 28, name: 'Garlic', cols: 13, rows: 6 },
]

function assetName(file) {
  return 'new-' + file.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
}

function img(file) {
  return 'images/products/' + assetName(file)
}

function button(id, label, page, row, col, span, plu, file, sortOrder) {
  const isKg = /\bKG\b/i.test(label)
  return {
    id,
    label,
    type: 'open_price',
    price: null,
    image: img(file),
    color: '#111',
    bg_color: '#ffffff',
    parent_id: null,
    category_filter: plu || null,
    alpha_range: 'image:contain',
    sort_order: sortOrder,
    position: 'grid',
    page,
    grid_row: row,
    grid_col: col,
    col_span: span,
    row_span: 2,
    product_id: null,
    active: 1,
  }
}

const newButtons = [
  button('pg25-green-cabbage', 'GREEN CABBAGE EA', 25, 0, 0, 2, '1222', 'cabbage.png', 0),
  button('pg25-red-cabbage', 'RED CABBAGE EA', 25, 0, 2, 2, '1282', 'red cabbage.png', 1),
  button('pg25-wombok', 'CHINESE CABBAGE EA', 25, 0, 4, 2, '1202', 'chinese cabbage or wombok.png', 2),
  button('pg25-sugarloaf', 'SUGARLOAF CABBAGE EA', 25, 0, 6, 2, '1312', 'sugarloaf cabbage.png', 3),
  { id: 'pg25-back', label: 'BACK', type: 'back_home', price: null, image: null, color: '#000', bg_color: GREEN, parent_id: null, category_filter: null, alpha_range: null, sort_order: 90, position: 'grid', page: 25, grid_row: 0, grid_col: 11, col_span: 2, row_span: 2, product_id: null, active: 1 },

  button('pg26-red-capsicum', 'RED CAPSICUM KG', 26, 0, 0, 2, '1331', 'red capsicum.png', 0),
  button('pg26-green-capsicum', 'GREEN CAPSICUM KG', 26, 0, 2, 2, '1341', 'green capsicum.png', 1),
  button('pg26-yellow-capsicum', 'YELLOW CAPSICUM KG', 26, 0, 4, 2, '1351', 'yellow capsicum.png', 2),
  { id: 'pg26-back', label: 'BACK', type: 'back_home', price: null, image: null, color: '#000', bg_color: GREEN, parent_id: null, category_filter: null, alpha_range: null, sort_order: 90, position: 'grid', page: 26, grid_row: 0, grid_col: 11, col_span: 2, row_span: 2, product_id: null, active: 1 },

  button('pg28-australian-garlic', 'AUSTRALIAN GARLIC KG', 28, 0, 0, 2, '729', 'australian garlic.png', 0),
  button('pg28-mexican-garlic', 'MEXICAN GARLIC KG', 28, 0, 2, 2, '1851', 'mexican garlic.png', 1),
  button('pg28-garlic-bag', 'GARLIC BAG EA', 28, 0, 4, 2, '9327072004103', 'garlic bag.png', 2),
  { id: 'pg28-back', label: 'BACK', type: 'back_home', price: null, image: null, color: '#000', bg_color: GREEN, parent_id: null, category_filter: null, alpha_range: null, sort_order: 90, position: 'grid', page: 28, grid_row: 0, grid_col: 11, col_span: 2, row_span: 2, product_id: null, active: 1 },
]

const sectionUpdates = {
  'pg4-cabbage': { type: 'page_link', parent_id: '25', price: 0, image: img('cabbage.png') },
  'pg4-capsicum': { type: 'page_link', parent_id: '26', price: 0, image: img('red capsicum.png') },
  'pg4-garlic': { type: 'page_link', parent_id: '28', price: 0, image: img('australian garlic.png') },
}

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
          value: Function(`return (${text.slice(open, i + 1)})`)(),
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

function setImageFields(b, file) {
  b.image = img(file)
  b.bg_color = '#ffffff'
  b.color = '#111'
  b.alpha_range = 'image:contain'
}

function applyToArrays(filePath, pageScope) {
  let text = fs.readFileSync(filePath, 'utf8')
  text = text.replace(/const VERSION = "[^"]+"/, `const VERSION = "${VERSION_SUFFIX}"`)
  const pagesParsed = readArray(text, 'pages')
  const buttonsParsed = readArray(text, 'buttons')
  const pages = pagesParsed.value
  const buttons = buttonsParsed.value

  if (pageScope === 'sub') {
    for (const p of pageDefs) {
      const existing = pages.find(x => Number(x.page) === p.page)
      if (existing) Object.assign(existing, p)
      else pages.push(p)
    }
    pages.sort((a, b) => Number(a.page) - Number(b.page))
  }

  for (const [file, ids] of updates) {
    for (const id of ids) {
      const b = buttons.find(x => x.id === id)
      if (b) setImageFields(b, file)
    }
  }

  if (pageScope === 'cat') {
    for (const [id, data] of Object.entries(sectionUpdates)) {
      const b = buttons.find(x => x.id === id)
      if (b) Object.assign(b, data, { bg_color: '#ffffff', color: '#111', alpha_range: 'image:contain', category_filter: null })
    }
  } else {
    for (const b of newButtons) {
      const idx = buttons.findIndex(x => x.id === b.id)
      if (idx >= 0) buttons[idx] = b
      else buttons.push(b)
    }
    buttons.sort((a, b) => Number(a.page) - Number(b.page) || Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)))
  }

  text = replaceArray(text, pagesParsed, pages)
  const buttonsParsedAfterPages = readArray(text, 'buttons')
  text = replaceArray(text, buttonsParsedAfterPages, buttons)
  fs.writeFileSync(filePath, text)
}

function copyAssets() {
  fs.mkdirSync(assetDir, { recursive: true })
  const copied = []
  for (const [file] of updates) {
    const src = path.join(sourceDir, file)
    if (!fs.existsSync(src)) throw new Error(`Missing source image: ${file}`)
    const dest = path.join(assetDir, assetName(file))
    fs.copyFileSync(src, dest)
    copied.push(path.relative(root, dest))
  }
  return copied
}

function updateDb(SQL, dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return { dbPath, skipped: true, updated: 0 }
  const db = new SQL.Database(fs.readFileSync(dbPath))
  let updated = 0

  for (const p of pageDefs) {
    db.run('INSERT OR REPLACE INTO keyboard_pages (page, name, cols, rows) VALUES (?, ?, ?, ?)', [p.page, p.name, p.cols, p.rows])
  }

  const btnCols = ['id','label','type','price','image','color','bg_color','parent_id','category_filter','alpha_range','sort_order','position','page','grid_row','grid_col','col_span','row_span','product_id','active']
  const upsertBtn = db.prepare(`INSERT OR REPLACE INTO keyboard_buttons (${btnCols.join(',')}) VALUES (${btnCols.map(() => '?').join(',')})`)
  for (const b of newButtons) {
    upsertBtn.run(btnCols.map(c => b[c] ?? null))
    updated++
  }
  upsertBtn.free()

  const imgStmt = db.prepare("UPDATE keyboard_buttons SET image = ?1, bg_color = '#ffffff', color = '#111', alpha_range = 'image:contain', updated_at = datetime('now') WHERE id = ?2 AND active = 1")
  for (const [file, ids] of updates) {
    for (const id of ids) {
      imgStmt.run([img(file), id])
      updated++
    }
  }
  imgStmt.free()

  const sectionStmt = db.prepare("UPDATE keyboard_buttons SET type = 'page_link', price = 0, parent_id = ?1, category_filter = NULL, image = ?2, bg_color = '#ffffff', color = '#111', alpha_range = 'image:contain', updated_at = datetime('now') WHERE id = ?3 AND active = 1")
  sectionStmt.run(['25', img('cabbage.png'), 'pg4-cabbage'])
  sectionStmt.run(['26', img('red capsicum.png'), 'pg4-capsicum'])
  sectionStmt.run(['28', img('australian garlic.png'), 'pg4-garlic'])
  sectionStmt.free()

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('kb_subpages_ver', ?)", [VERSION_SUFFIX])
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('kb_catpages_ver', ?)", [VERSION_SUFFIX])
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db.close()
  return { dbPath, updated }
}

async function main() {
  const copied = copyAssets()
  applyToArrays(path.join(root, 'db', 'keyboard-subpages.js'), 'sub')
  applyToArrays(path.join(root, 'db', 'keyboard-catpages.js'), 'cat')
  const SQL = await initSqlJs()
  const results = [updateDb(SQL, bundledDbPath)]
  if (runtimeDbPath) results.push(updateDb(SQL, runtimeDbPath))
  console.log(JSON.stringify({ copied, results }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
