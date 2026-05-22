const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const dbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const layoutPath = path.join(root, 'keyboard-layout.json')
const version = '2026-05-21-register-subpage-layout'
const untouchedPages = new Set([1, 2, 3, 4, 5])

const customLayouts = {
  7: {
    rows: 8,
    positions: {
      'pg7-btn6': [0, 0, 3, 2], // Large Pink Lady above small
      'pg7-btn7': [0, 3, 3, 2], // Large Granny Smith above small
      'pg7-btn8': [0, 6, 3, 2], // Large Royal Gala above small
      'pg7-btn0': [0, 9, 2, 2],
      'pg7-back': [0, 11, 2, 2],
      'pg7-btn1': [2, 0, 3, 2],
      'pg7-btn2': [2, 3, 3, 2],
      'pg7-btn3': [2, 6, 3, 2],
      'pg7-btn4': [4, 0, 2, 2],
      'pg7-btn9': [4, 2, 2, 2],
      'pg7-btn12': [4, 4, 2, 2],
      'pg7-btn11': [4, 6, 2, 2],
      'pg7-btn5': [4, 8, 2, 2],
      'pg7-btn10': [4, 10, 2, 2]
    }
  },
  10: {
    rows: 6,
    positions: {
      'pg10-btn0': [0, 0, 3, 2],
      'pg10-btn1': [0, 3, 3, 2],
      'pg10-back': [0, 11, 2, 2],
      'pg10-btn2': [2, 0, 3, 2],
      'pg10-btn3': [2, 3, 3, 2]
    }
  },
  16: {
    rows: 6,
    positions: {
      'pg16-btn0': [0, 0, 2, 2],
      'pg16-btn3': [0, 2, 2, 2],
      'pg16-btn6': [0, 4, 2, 2],
      'pg16-btn1': [0, 6, 2, 2],
      'pg16-btn2': [0, 8, 2, 2],
      'pg16-back': [0, 11, 2, 2],
      'pg16-btn5': [2, 0, 2, 2],
      'pg16-btn4': [2, 2, 2, 2]
    }
  },
  32: {
    rows: 8,
    positions: {
      'pg32-btn0': [0, 0, 3, 2],
      'pg32-btn1': [0, 3, 3, 2],
      'pg32-btn2': [0, 6, 3, 2],
      'pg32-back': [0, 11, 2, 2],
      'pg32-btn5': [2, 0, 3, 2],
      'pg32-btn4': [2, 3, 3, 2],
      'pg32-red-chats': [2, 6, 3, 2],
      'pg32-btn3': [4, 0, 3, 2]
    }
  },
  33: {
    rows: 8,
    positions: {
      'pg33-btn0': [0, 0, 2, 2],
      'pg33-btn1': [0, 2, 2, 2],
      'pg33-btn2': [0, 4, 2, 2],
      'pg33-back': [0, 11, 2, 2],
      'pg33-btn3': [2, 0, 2, 2],
      'pg33-btn4': [2, 2, 2, 2],
      'pg33-btn5': [2, 4, 2, 2],
      'pg33-btn6': [4, 0, 2, 2],
      'pg33-btn7': [4, 2, 2, 2],
      'pg33-btn8': [4, 4, 2, 2]
    }
  },
  34: {
    rows: 6,
    positions: {
      'pg34-btn0': [0, 0, 2, 2],
      'pg34-btn1': [0, 2, 2, 2],
      'pg34-btn2': [0, 4, 2, 2],
      'pg34-back': [0, 11, 2, 2],
      'pg34-btn3': [2, 0, 2, 2]
    }
  },
  35: {
    rows: 6,
    positions: {
      'pg35-roma-kg': [0, 0, 2, 2],
      'pg35-roma-egg-kg': [0, 2, 2, 2],
      'pg35-truss-kg': [0, 4, 2, 2],
      'pg35-back': [0, 11, 2, 2],
      'pg35-round-roma-bucket': [2, 0, 2, 2],
      'pg35-roma-bucket': [2, 2, 2, 2],
      'pg35-heirloom': [2, 4, 2, 2]
    }
  }
}

function all (db, query, params = []) {
  const stmt = db.prepare(query, params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function setButton (db, id, row, col, colSpan, rowSpan, sortOrder) {
  db.run(
    `UPDATE keyboard_buttons
       SET grid_row = ?1, grid_col = ?2, col_span = ?3, row_span = ?4,
           sort_order = ?5, position = 'grid', updated_at = datetime('now')
     WHERE id = ?6`,
    [row, col, colSpan, rowSpan, sortOrder, id]
  )
}

function setPage (db, page, cols, rows) {
  db.run('UPDATE keyboard_pages SET cols = ?1, rows = ?2 WHERE page = ?3', [cols, rows, page])
}

function packPage (buttons, cols) {
  const back = buttons.find(b => b.type === 'back_home')
  const others = buttons
    .filter(b => b.type !== 'back_home')
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.label).localeCompare(String(b.label)))
  const updates = []
  let row = 0
  let col = 0
  let sort = 1
  if (back) updates.push({ id: back.id, row: 0, col: cols - 2, cs: 2, rs: 2, sort: 90 })
  for (const b of others) {
    const cs = Math.min(Math.max(b.col_span || 2, 2), b.col_span >= 3 ? 3 : 2)
    const rs = Math.min(Math.max(b.row_span || 2, 2), 2)
    const maxCol = row === 0 && back ? cols - 4 : cols - cs
    if (col > maxCol) {
      row += 2
      col = 0
    }
    updates.push({ id: b.id, row, col, cs, rs, sort: sort++ })
    col += cs
  }
  const rows = Math.max(6, ...updates.map(u => u.row + u.rs))
  return { rows, updates }
}

function findArrayEnd (source, start) {
  const firstBracket = source.indexOf('[', start)
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = firstBracket; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  throw new Error('Could not find array end')
}

function extractConstArray (source, name) {
  const start = source.indexOf(`const ${name} =`)
  if (start < 0) throw new Error(`Could not find const ${name}`)
  const arrayStart = source.indexOf('[', start)
  const arrayEnd = findArrayEnd(source, start)
  return {
    value: Function(`return (${source.slice(arrayStart, arrayEnd)})`)(),
    start: arrayStart,
    end: arrayEnd
  }
}

function syncSeedFile (filePath, dbPages, dbButtons, pageFilter) {
  let source = fs.readFileSync(filePath, 'utf8')
  source = source.replace(/const VERSION = ["'][^"']+["']/, `const VERSION = "${version}"`)
  const pagesArr = extractConstArray(source, 'pages')
  const buttonsArr = extractConstArray(source, 'buttons')
  const pages = pagesArr.value.map(p => pageFilter(p.page) && dbPages.has(p.page) ? { ...p, cols: dbPages.get(p.page).cols, rows: dbPages.get(p.page).rows } : p)
  const buttons = buttonsArr.value.map(b => {
    const row = dbButtons.get(b.id)
    if (!row || !pageFilter(row.page)) return b
    return {
      ...b,
      page: row.page,
      grid_row: row.grid_row,
      grid_col: row.grid_col,
      col_span: row.col_span,
      row_span: row.row_span,
      sort_order: row.sort_order
    }
  })
  source = source.slice(0, pagesArr.start) + JSON.stringify(pages, null, 2) + source.slice(pagesArr.end)
  const buttonsArr2 = extractConstArray(source, 'buttons')
  source = source.slice(0, buttonsArr2.start) + JSON.stringify(buttons, null, 2) + source.slice(buttonsArr2.end)
  fs.writeFileSync(filePath, source)
}

function assertNoOverlaps (pages, buttons) {
  const issues = []
  for (const page of pages) {
    const occupied = new Map()
    const pageButtons = buttons.filter(b => b.active && b.page === page.page)
    for (const b of pageButtons) {
      for (let r = b.grid_row; r < b.grid_row + b.row_span; r++) {
        for (let c = b.grid_col; c < b.grid_col + b.col_span; c++) {
          const key = `${r},${c}`
          if (r < 0 || c < 0 || r >= page.rows || c >= page.cols) issues.push(`${page.page} ${b.id} outside grid at ${key}`)
          if (occupied.has(key)) issues.push(`${page.page} overlap ${occupied.get(key)} / ${b.id} at ${key}`)
          occupied.set(key, b.id)
        }
      }
    }
  }
  if (issues.length) throw new Error(`Keyboard layout issues:\n${issues.join('\n')}`)
}

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const pages = all(db, 'SELECT page, name, cols, rows FROM keyboard_pages ORDER BY page')
  let touchedButtons = 0

  for (const page of pages) {
    if (untouchedPages.has(page.page)) continue
    const buttons = all(db, 'SELECT id, label, type, sort_order, col_span, row_span FROM keyboard_buttons WHERE active = 1 AND page = ?1 ORDER BY sort_order, label', [page.page])
    if (!buttons.length) continue
    const custom = customLayouts[page.page]
    if (custom) {
      setPage(db, page.page, 13, custom.rows)
      let sort = 1
      for (const [id, [row, col, cs, rs]] of Object.entries(custom.positions)) {
        setButton(db, id, row, col, cs, rs, id.endsWith('-back') ? 90 : sort++)
        touchedButtons++
      }
      continue
    }

    const cols = page.page === 37 ? 8 : 13
    const { rows, updates } = packPage(buttons, cols)
    setPage(db, page.page, cols, rows)
    for (const u of updates) {
      setButton(db, u.id, u.row, u.col, u.cs, u.rs, u.sort)
      touchedButtons++
    }
  }

  db.run("UPDATE keyboard_buttons SET bg_color = '#22c55e', color = '#000', updated_at = datetime('now') WHERE page > 5 AND type = 'back_home'")

  const finalPages = all(db, 'SELECT page, name, cols, rows FROM keyboard_pages ORDER BY page')
  const finalButtons = all(db, `SELECT id,label,type,price,image,image_scale,color,bg_color,parent_id,category_filter,alpha_range,sort_order,position,page,grid_row,grid_col,col_span,row_span,active,product_id
    FROM keyboard_buttons ORDER BY page, grid_row, grid_col, sort_order, id`)
  assertNoOverlaps(finalPages, finalButtons)

  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'))
  layout.version = Number(layout.version || 0) + 1
  layout.exported = new Date().toISOString()
  layout.pages = finalPages
  layout.buttons = finalButtons
  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + '\n')

  const pageMap = new Map(finalPages.map(p => [p.page, p]))
  const buttonMap = new Map(finalButtons.map(b => [b.id, b]))
  syncSeedFile(path.join(root, 'db', 'keyboard-subpages.js'), pageMap, buttonMap, page => page > 5 && page !== 37)
  syncSeedFile(path.join(root, 'db', 'keyboard-catpages.js'), pageMap, buttonMap, page => [37, 38, 39].includes(page))

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.close()
  console.log(`Reflowed ${touchedButtons} buttons on register subpages. Pages 1-5 were left untouched.`)
}).catch(err => {
  console.error(err)
  process.exit(1)
})
