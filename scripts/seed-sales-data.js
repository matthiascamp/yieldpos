/**
 * Seed screenshot-friendly demo sales data into the bundled YieldPOS database.
 *
 * Usage:
 *   node scripts/seed-sales-data.js
 *   node scripts/seed-sales-data.js path/to/crisp-pos.sqlite
 *
 * The generated rows use stable demo-* ids and are deleted/recreated on each run.
 */
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.join(__dirname, '..')
const dbPath = path.resolve(process.argv[2] || path.join(root, 'db', 'crisp-pos.sqlite'))

const REGISTER_ID = 'LANE01'
const WEEK_START = '2026-05-18'

const staff = [
  { id: 'demo-staff-ava', name: 'Ava', pin: '1111', role: 'manager', weight: 0.21 },
  { id: 'demo-staff-noah', name: 'Noah', pin: '2222', role: 'cashier', weight: 0.28 },
  { id: 'demo-staff-mia', name: 'Mia', pin: '3333', role: 'cashier', weight: 0.24 },
  { id: 'demo-staff-leo', name: 'Leo', pin: '4444', role: 'cashier', weight: 0.18 },
  { id: 'demo-staff-owner', name: 'Owner', pin: '1234', role: 'admin', weight: 0.09 }
]

const products = [
  { id: 'demo-prod-bananas', name: 'Cavendish Bananas KG', category: 'cat-bananas', price: 4.99, unit: 'kg', tax: 0, code: '990001', image: 'images/products/github-banana.jpg', weight: 16 },
  { id: 'demo-prod-pink-lady', name: 'Pink Lady Apples KG', category: 'cat-apples', price: 5.99, unit: 'kg', tax: 0, code: '990002', image: 'images/products/github-apple-rg.jpg', weight: 11 },
  { id: 'demo-prod-avocado', name: 'Hass Avocado EA', category: 'cat-avocados', price: 2.99, unit: 'each', tax: 0, code: '990003', image: 'images/products/new-hass-avo.png', weight: 10 },
  { id: 'demo-prod-strawberries', name: 'Strawberries Punnet', category: 'cat-berries', price: 5.99, unit: 'each', tax: 0, code: '990004', image: 'images/products/github-strawberry.jpg', weight: 9 },
  { id: 'demo-prod-tomatoes', name: 'Round Tomatoes KG', category: 'cat-tomatoes', price: 6.89, unit: 'kg', tax: 0, code: '990005', image: 'images/products/github-tomato.jpg', weight: 8 },
  { id: 'demo-prod-blueberries', name: 'Blueberries Punnet', category: 'cat-berries', price: 8.99, unit: 'each', tax: 0, code: '990006', image: 'images/products/coles-123328-zm.jpg', weight: 6 },
  { id: 'demo-prod-sourdough', name: 'Sourdough Loaf', category: 'cat-bread', price: 6.50, unit: 'each', tax: 0, code: '990007', image: 'images/products/coles-4565907-zm.jpg', weight: 5 },
  { id: 'demo-prod-flowers', name: 'Flowers Open Price', category: 'cat-flowers', price: 18.50, unit: 'each', tax: 0.1, code: '990008', image: 'images/products/pexels-flowers.jpg', weight: 4 },
  { id: 'demo-prod-cheese', name: 'Cheese Selection', category: 'cat-cheese', price: 12.99, unit: 'each', tax: 0.1, code: '990009', image: 'images/products/pexels-cheese.jpg', weight: 4 },
  { id: 'demo-prod-coffee', name: 'Coffee Beans 1kg', category: 'cat-coffee', price: 19.00, unit: 'each', tax: 0.1, code: '990010', image: 'images/products/pexels-coffee.jpg', weight: 4 },
  { id: 'demo-prod-potatoes', name: 'Washed Potatoes KG', category: 'cat-potatoes', price: 3.99, unit: 'kg', tax: 0, code: '990011', image: 'images/products/github-potato.jpg', weight: 7 },
  { id: 'demo-prod-lettuce', name: 'Iceberg Lettuce EA', category: 'cat-lettuces', price: 2.99, unit: 'each', tax: 0, code: '990012', image: 'images/products/github-lettuce.jpg', weight: 5 },
  { id: 'demo-prod-oranges', name: 'Navel Oranges KG', category: 'cat-oranges', price: 4.99, unit: 'kg', tax: 0, code: '990013', image: 'images/products/github-orange.jpg', weight: 5 },
  { id: 'demo-prod-limes', name: 'Limes EA', category: 'cat-limes', price: 1.99, unit: 'each', tax: 0, code: '990014', image: 'images/products/new-lime-bag.png', weight: 3 },
  { id: 'demo-prod-corn', name: 'Sweet Corn EA', category: 'cat-veg', price: 1.49, unit: 'each', tax: 0, code: '990015', image: 'images/products/coles-4562603-zm.jpg', weight: 4 },
  { id: 'demo-prod-grapes', name: 'Red Grapes KG', category: 'cat-grapes', price: 5.99, unit: 'kg', tax: 0, code: '990016', image: 'images/products/new-red-grapes.png', weight: 4 },
  { id: 'demo-prod-broccoli', name: 'Broccoli KG', category: 'cat-broccoli', price: 4.59, unit: 'kg', tax: 0, code: '990017', image: 'images/products/github-broccoli.jpg', weight: 4 },
  { id: 'demo-prod-carrots', name: 'Carrots KG', category: 'cat-veg', price: 3.69, unit: 'kg', tax: 0, code: '990018', image: 'images/products/github-carrot.jpg', weight: 4 },
  { id: 'demo-prod-olives', name: 'Deli Olives 250g', category: 'cat-deli', price: 7.50, unit: 'each', tax: 0.1, code: '990019', image: 'images/products/new-olives.png', weight: 3 },
  { id: 'demo-prod-nuts', name: 'Mixed Nuts 500g', category: 'cat-nuts', price: 12.50, unit: 'each', tax: 0.1, code: '990020', image: 'images/products/pexels-nuts.jpg', weight: 3 },
  { id: 'demo-prod-milk', name: 'Milk 2L', category: 'cat-dairy', price: 4.80, unit: 'each', tax: 0, code: '990021', image: 'images/products/coles-4583206-zm.jpg', weight: 3 },
  { id: 'demo-prod-eggs', name: 'Free Range Eggs 12pk', category: 'c6e21cc0-aa3f-4f44-9c02-2201b4c0e871', price: 8.99, unit: 'each', tax: 0, code: '990022', image: 'images/products/coles-4583261-zm.jpg', weight: 3 }
]

const dayPlan = [
  { date: '2026-05-18', name: 'Monday', target: 6420.35, txns: 312 },
  { date: '2026-05-19', name: 'Tuesday', target: 6985.80, txns: 335 },
  { date: '2026-05-20', name: 'Wednesday', target: 7240.10, txns: 346 },
  { date: '2026-05-21', name: 'Thursday', target: 7615.65, txns: 365 },
  { date: '2026-05-22', name: 'Friday', target: 8935.25, txns: 421 },
  { date: '2026-05-23', name: 'Saturday', target: 2962.30, txns: 201 },
  { date: '2026-05-24', name: 'Sunday', target: 9840.55, txns: 482 }
]

const hourlyWeights = [
  [6, 0.4], [7, 0.8], [8, 1.3], [9, 1.8], [10, 2.1], [11, 1.9],
  [12, 1.5], [13, 1.2], [14, 0.9], [15, 0.8], [16, 0.7], [17, 0.5]
]

const auditEvents = [
  ['2026-05-18 08:12:00', 'demo-staff-ava', 'Ava', 'float_set', 'Opening float recorded at $500.00'],
  ['2026-05-18 10:44:00', 'demo-staff-noah', 'Noah', 'discount_item', '10% off marked produce item'],
  ['2026-05-19 14:18:00', 'demo-staff-owner', 'Owner', 'product_price_change', 'Strawberries Punnet changed to $5.99'],
  ['2026-05-20 11:05:00', 'demo-staff-mia', 'Mia', 'no_sale', 'Drawer opened for customer change'],
  ['2026-05-22 16:32:00', 'demo-staff-ava', 'Ava', 'deal_activated', 'Hass Avocado 2 for $5 activated'],
  ['2026-05-24 12:18:00', 'demo-staff-noah', 'Noah', 'refund', 'Returned 2 items from original receipt'],
  ['2026-05-24 17:05:00', 'demo-staff-ava', 'Ava', 'end_of_day', 'Counted cash variance -$1.65']
]

let seed = 24052026
function rand () {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}

function round2 (n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function cents (n) {
  return Math.round(n * 100)
}

function money (c) {
  return round2(c / 100)
}

function weightedPick (items, weightKey = 'weight') {
  const total = items.reduce((sum, item) => sum + (item[weightKey] || 1), 0)
  let roll = rand() * total
  for (const item of items) {
    roll -= item[weightKey] || 1
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

function timeForTxn (date, index, total) {
  const { hour } = weightedPick(hourlyWeights.map(([hour, weight]) => ({ hour, weight })))
  const minute = Math.floor(rand() * 60)
  const second = Math.floor(rand() * 60)
  const jitter = Math.floor((index / Math.max(total, 1)) * 4)
  return `${date} ${String(Math.min(hour + jitter, 18)).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function txnTotalCents (averageCents) {
  const low = Math.max(550, Math.round(averageCents * 0.38))
  const high = Math.round(averageCents * 2.35)
  const shaped = Math.pow(rand(), 1.35)
  return Math.round((low + (high - low) * shaped) / 5) * 5
}

function splitTotalIntoItems (totalCents) {
  const count = totalCents < 1200 ? 1 : totalCents < 2600 ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 4)
  const chosen = []
  for (let i = 0; i < count; i++) chosen.push(weightedPick(products))

  let remaining = totalCents
  return chosen.map((product, idx) => {
    const last = idx === chosen.length - 1
    let lineCents
    if (last) {
      lineCents = Math.max(50, remaining)
    } else {
      const max = Math.max(100, remaining - (chosen.length - idx - 1) * 250)
      const min = Math.min(max, product.unit === 'kg' ? 250 : Math.max(250, cents(product.price)))
      lineCents = Math.max(50, Math.round((min + rand() * (max - min)) / 5) * 5)
      remaining -= lineCents
    }

    if (product.unit === 'kg') {
      const qty = Math.max(0.08, round2(money(lineCents) / product.price))
      return { product, qty, unitPrice: product.price, lineTotal: round2(qty * product.price) }
    }

    if (product.id === 'demo-prod-flowers') {
      return { product, qty: 1, unitPrice: money(lineCents), lineTotal: money(lineCents) }
    }

    const unit = cents(product.price)
    const qty = Math.max(1, Math.round(lineCents / unit))
    return { product, qty, unitPrice: product.price, lineTotal: round2(qty * product.price) }
  })
}

function hasTable (db, table) {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [table])
  return !!res[0]?.values?.length
}

function dbRun (db, sql, params = []) {
  db.run(sql, params)
}

function clearDemoRows (db) {
  dbRun(db, "DELETE FROM payments WHERE id LIKE 'demo-%' OR transaction_id LIKE 'demo-txn-%'")
  dbRun(db, "DELETE FROM transaction_items WHERE id LIKE 'demo-%' OR transaction_id LIKE 'demo-txn-%'")
  dbRun(db, "DELETE FROM transactions WHERE id LIKE 'demo-txn-%'")
  dbRun(db, "DELETE FROM cash_drawer WHERE id LIKE 'demo-%'")
  dbRun(db, "DELETE FROM audit_log WHERE id LIKE 'demo-%'")
  if (hasTable(db, 'sync_queue')) dbRun(db, "DELETE FROM sync_queue WHERE record_id LIKE 'demo-%'")
}

function upsertStaff (db) {
  for (const s of staff) {
    dbRun(db, `INSERT OR REPLACE INTO staff (id, name, pin, role, active, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))`, [s.id, s.name, s.pin, s.role])
  }
}

function upsertProducts (db) {
  for (const p of products) {
    dbRun(db, `INSERT OR REPLACE INTO products
      (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, open_price, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 1, ?, 0, datetime('now'))`,
      [p.id, p.code, p.code, p.name, p.category, p.price, p.unit, p.tax, p.image])
  }
}

function insertTransaction (db, tx) {
  dbRun(db, `INSERT INTO transactions
    (id, register_id, staff_id, customer_name, subtotal, tax, discount, total, status, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    [tx.id, REGISTER_ID, tx.staff.id, tx.subtotal, tx.tax, tx.discount, tx.total, tx.status, tx.createdAt])

  for (let i = 0; i < tx.items.length; i++) {
    const item = tx.items[i]
    const tax = round2(item.lineTotal * item.product.tax)
    dbRun(db, `INSERT INTO transaction_items
      (id, transaction_id, product_id, name, qty, unit_price, discount, line_total, tax, deal_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [`demo-item-${tx.id}-${i}`, tx.id, item.product.id, item.product.name, item.qty, item.unitPrice, item.lineTotal, tax, tx.dealId || null])
  }

  for (let i = 0; i < tx.payments.length; i++) {
    const payment = tx.payments[i]
    dbRun(db, `INSERT INTO payments (id, transaction_id, method, amount, reference, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [`demo-pay-${tx.id}-${i}`, tx.id, payment.method, payment.amount, payment.reference || null, tx.createdAt])
  }
}

function paymentFor (total, idx) {
  const r = rand()
  if (r < 0.233) return [{ method: 'cash', amount: total }]
  if (r < 0.95) return [{ method: idx % 5 === 0 ? 'eftpos' : 'card', amount: total, reference: `DEMO-${100000 + idx}` }]
  return [{ method: 'account', amount: total, reference: `ACC-${5000 + idx}` }]
}

function seedTransactions (db) {
  let completed = 0
  let gross = 0
  let lineItems = 0

  for (const day of dayPlan) {
    let dayTotalCents = 0
    const targetCents = cents(day.target)
    const avgCents = Math.round(targetCents / day.txns)

    for (let i = 0; i < day.txns; i++) {
      const remainingTxns = day.txns - i
      const remainingCents = targetCents - dayTotalCents
      let planned = i === day.txns - 1 ? remainingCents : Math.min(remainingCents - (remainingTxns - 1) * 550, txnTotalCents(avgCents))
      planned = Math.max(550, Math.round(planned / 5) * 5)

      const items = splitTotalIntoItems(planned)
      const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0))
      const tax = round2(items.reduce((sum, item) => sum + item.lineTotal * item.product.tax, 0))
      const discount = rand() < 0.045 ? round2(subtotal * 0.1) : 0
      const total = round2(subtotal + tax - discount)
      const totalCents = cents(total)
      dayTotalCents += totalCents

      const staffMember = weightedPick(staff)
      const tx = {
        id: `demo-txn-${day.date}-${String(i + 1).padStart(4, '0')}`,
        staff: staffMember,
        createdAt: timeForTxn(day.date, i, day.txns),
        subtotal,
        tax,
        discount,
        total,
        status: 'completed',
        payments: paymentFor(total, i),
        items
      }
      insertTransaction(db, tx)
      completed++
      gross += total
      lineItems += items.length
    }
  }

  return { completed, gross: round2(gross), lineItems }
}

function seedVoidsAndRefunds (db) {
  const voids = [
    ['2026-05-19 09:42:18', 'demo-staff-noah', 'demo-prod-strawberries', 2],
    ['2026-05-21 13:05:44', 'demo-staff-mia', 'demo-prod-cheese', 1],
    ['2026-05-24 10:12:03', 'demo-staff-ava', 'demo-prod-flowers', 1]
  ]
  const refunds = [
    ['2026-05-22 15:21:10', 'demo-staff-leo', 'demo-prod-avocado', 2],
    ['2026-05-24 12:18:30', 'demo-staff-noah', 'demo-prod-blueberries', 1],
    ['2026-05-24 12:18:30', 'demo-staff-noah', 'demo-prod-sourdough', 1]
  ]

  for (let i = 0; i < voids.length; i++) {
    const [createdAt, staffId, productId, qty] = voids[i]
    const product = products.find(p => p.id === productId)
    const total = round2(product.price * qty)
    insertTransaction(db, {
      id: `demo-txn-void-${i + 1}`,
      staff: staff.find(s => s.id === staffId),
      createdAt,
      subtotal: total,
      tax: round2(total * product.tax),
      discount: 0,
      total: round2(total + total * product.tax),
      status: 'voided',
      payments: [],
      items: [{ product, qty, unitPrice: product.price, lineTotal: total }]
    })
  }

  for (let i = 0; i < refunds.length; i++) {
    const [createdAt, staffId, productId, qty] = refunds[i]
    const product = products.find(p => p.id === productId)
    const subtotal = round2(-(product.price * qty))
    const tax = round2(subtotal * product.tax)
    const total = round2(subtotal + tax)
    insertTransaction(db, {
      id: `demo-txn-refund-${i + 1}`,
      staff: staff.find(s => s.id === staffId),
      createdAt,
      subtotal,
      tax,
      discount: 0,
      total,
      status: 'refunded',
      payments: [{ method: i === 0 ? 'card' : 'cash', amount: total, reference: i === 0 ? 'DEMO-REFUND' : null }],
      items: [{ product, qty: -qty, unitPrice: product.price, lineTotal: subtotal }]
    })
  }
}

function seedCashDrawer (db) {
  const cash = {
    '2026-05-18': { pickup: 800, drop: 0 },
    '2026-05-19': { pickup: 900, drop: 0 },
    '2026-05-20': { pickup: 900, drop: 150 },
    '2026-05-21': { pickup: 1000, drop: 0 },
    '2026-05-22': { pickup: 1100, drop: 150 },
    '2026-05-23': { pickup: 500, drop: 0 },
    '2026-05-24': { pickup: 1200, drop: 300 }
  }

  for (const day of dayPlan) {
    const c = cash[day.date]
    dbRun(db, `INSERT INTO cash_drawer (id, register_id, staff_id, action, amount, note, created_at)
      VALUES (?, ?, ?, 'float', 500, 'Opening float', ?)`,
      [`demo-drawer-${day.date}-float`, REGISTER_ID, 'demo-staff-ava', `${day.date} 05:55:00`])
    dbRun(db, `INSERT INTO cash_drawer (id, register_id, staff_id, action, amount, note, created_at)
      VALUES (?, ?, ?, 'pickup', ?, 'Midday safe pickup', ?)`,
      [`demo-drawer-${day.date}-pickup`, REGISTER_ID, 'demo-staff-ava', c.pickup, `${day.date} 13:10:00`])
    if (c.drop) {
      dbRun(db, `INSERT INTO cash_drawer (id, register_id, staff_id, action, amount, note, created_at)
        VALUES (?, ?, ?, 'drop', ?, 'Extra till cash added', ?)`,
        [`demo-drawer-${day.date}-drop`, REGISTER_ID, 'demo-staff-owner', c.drop, `${day.date} 15:45:00`])
    }
    dbRun(db, `INSERT INTO cash_drawer (id, register_id, staff_id, action, amount, note, created_at)
      VALUES (?, ?, ?, 'close', ?, 'End of day count recorded', ?)`,
      [`demo-drawer-${day.date}-close`, REGISTER_ID, 'demo-staff-ava', 0, `${day.date} 18:35:00`])
  }
}

function seedAuditLog (db) {
  auditEvents.forEach((event, idx) => {
    dbRun(db, `INSERT INTO audit_log (id, staff_id, staff_name, action, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [`demo-audit-${String(idx + 1).padStart(2, '0')}`, event[1], event[2], event[3], event[4], event[0]])
  })
}

function setDemoSettings (db, summary) {
  const values = {
    demo_sales_seed_v1: '1',
    demo_sales_week_start: WEEK_START,
    demo_sales_week_gross: String(summary.gross),
    demo_sales_transactions: String(summary.completed),
    demo_sales_note: 'Fictional screenshot/demo trading data'
  }
  for (const [key, value] of Object.entries(values)) {
    dbRun(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  }
}

async function main () {
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`)
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  clearDemoRows(db)
  upsertStaff(db)
  upsertProducts(db)
  const summary = seedTransactions(db)
  seedVoidsAndRefunds(db)
  seedCashDrawer(db)
  seedAuditLog(db)
  setDemoSettings(db, summary)

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.close()

  console.log(`Seeded demo sales into ${dbPath}`)
  console.log(`Completed transactions: ${summary.completed}`)
  console.log(`Line items: ${summary.lineItems}`)
  console.log(`Gross sales: $${summary.gross.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  console.log(`Week: ${WEEK_START} to 2026-05-24`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
