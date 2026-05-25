/*
 * Reconcile Fruit/Vegetables website barcodes from products.json back into the
 * YieldPOS SQLite database. The website uses products.json today, so every
 * Fruit/Veg barcode there must resolve to an active products.plu/barcode row.
 */

const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const productsPath = path.join(root, 'products.json')
const defaultDbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const runtimeDbPath = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'YieldPOS Client', 'crisp-pos.sqlite')
  : null

const explicitTargets = process.argv.slice(2)
const dbTargets = explicitTargets.length
  ? explicitTargets.map(p => path.resolve(p))
  : [defaultDbPath, runtimeDbPath].filter(Boolean).filter((p, i, arr) => fs.existsSync(p) && arr.indexOf(p) === i)

function norm (value) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function looseNorm (value) {
  return norm(value)
    .replace(/\b(LGE|LARGE|SML|SM|SMALL|KG|PER KG|EA|EACH)\b/g, ' ')
    .replace(/\bAPPLES\b/g, 'APPLE')
    .replace(/\bPEARS\b/g, 'PEAR')
    .replace(/\bMANGOES\b/g, 'MANGO')
    .replace(/\bPOTATOES\b/g, 'POTATO')
    .replace(/\s+/g, ' ')
    .trim()
}

function qIdent (name) {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

function execRows (db, sql, params = []) {
  const res = db.exec(sql, params)
  if (!res.length) return []
  return res[0].values.map(values => Object.fromEntries(res[0].columns.map((col, idx) => [col, values[idx]])))
}

function run (db, sql, params = []) {
  db.run(sql, params)
}

function inferUnit (name) {
  const n = norm(name)
  if (/\b(KG|PER KG)\b/.test(n)) return 'kg'
  if (/\b(EA|EACH)\b/.test(n)) return 'each'
  if (/\b(PUNNET|BAG|PACK|PK)\b/.test(n)) return 'each'
  return 'each'
}

function stableIdForCode (code) {
  return `website-fv-${String(code).replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function loadWebsiteFruitVeg () {
  const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'))
  const rows = []
  for (const category of ['Fruit', 'Vegetables']) {
    for (const product of data[category] || []) {
      const code = String(product.plu || product.barcode || '').trim()
      if (!code) continue
      rows.push({
        source_category: category,
        name: product.name,
        code,
        price: Number(product.price || 0),
        unit: product.unit || inferUnit(product.name),
        category_id: category === 'Fruit' ? 'cat-fruit' : 'cat-veg',
        norm: norm(product.name),
        loose: looseNorm(product.name)
      })
    }
  }
  return rows
}

function chooseCandidate (products, websiteProduct) {
  const exact = products.filter(p => norm(p.name) === websiteProduct.norm)
  if (exact.length === 1) return exact[0]

  const priceList = products.find(p => p.id === `price-list-${websiteProduct.code}`)
  if (priceList) return priceList

  const loose = products.filter(p => looseNorm(p.name) === websiteProduct.loose)
  if (loose.length === 1) return loose[0]

  return null
}

function rowMatchesWebsite (row, websiteProduct) {
  return norm(row.name) === websiteProduct.norm || looseNorm(row.name) === websiteProduct.loose
}

function nextAvailablePlu (db) {
  const used = new Set(execRows(db, `
    SELECT plu
    FROM products
    WHERE plu IS NOT NULL
      AND TRIM(plu) != ''
      AND plu GLOB '[0-9]*'
  `).map(row => String(row.plu)))
  const numeric = [...used].filter(value => /^\d+$/.test(value)).map(value => Number(value))
  let next = Math.max(900000, numeric.length ? Math.max(...numeric) + 1 : 900000)
  while (used.has(String(next))) next++
  return String(next)
}

function moveCodeFromOtherProducts (db, code, keepId, changes) {
  const conflicts = execRows(db, `
    SELECT id, name, plu, barcode
    FROM products
    WHERE id != ?1
      AND active = 1
      AND (plu = ?2 OR barcode = ?2)
  `, [keepId, code])

  for (const conflict of conflicts) {
    const conflictPlu = String(conflict.plu || '').trim()
    const conflictBarcode = String(conflict.barcode || '').trim()
    if (conflictPlu === code) {
      const replacement = nextAvailablePlu(db)
      run(db, `
        UPDATE products
        SET plu = ?1,
            barcode = CASE WHEN barcode = ?2 THEN ?1 ELSE barcode END,
            updated_at = datetime('now')
        WHERE id = ?3
      `, [replacement, code, conflict.id])
      run(db, `
        UPDATE keyboard_buttons
        SET category_filter = ?1, updated_at = datetime('now')
        WHERE product_id = ?2
          AND category_filter = ?3
      `, [replacement, conflict.id, code])
      changes.push({ action: 'moved_conflicting_plu', code, old_product_id: conflict.id, old_product_name: conflict.name, replacement })
    } else if (conflictBarcode === code) {
      const replacement = conflictPlu && conflictPlu !== code ? conflictPlu : null
      run(db, `
        UPDATE products
        SET barcode = ?1,
            updated_at = datetime('now')
        WHERE id = ?2
      `, [replacement, conflict.id])
      if (replacement) {
        run(db, `
          UPDATE keyboard_buttons
          SET category_filter = ?1, updated_at = datetime('now')
          WHERE product_id = ?2
            AND category_filter = ?3
        `, [replacement, conflict.id, code])
      }
      changes.push({ action: 'cleared_conflicting_barcode', code, old_product_id: conflict.id, old_product_name: conflict.name, replacement: replacement || '' })
    }
  }
}

function reconcileDb (SQL, dbPath, websiteProducts) {
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const products = execRows(db, 'SELECT id, name, barcode, plu, price, active, category_id, unit FROM products')
  const productsByCode = new Map()
  for (const product of products) {
    for (const code of [product.plu, product.barcode].map(v => String(v || '').trim()).filter(Boolean)) {
      if (!productsByCode.has(code)) productsByCode.set(code, [])
      productsByCode.get(code).push(product)
    }
  }

  const changes = []
  run(db, 'BEGIN')
  try {
    for (const websiteProduct of websiteProducts) {
      const existingRows = (productsByCode.get(websiteProduct.code) || []).filter(product => Number(product.active) === 1)
      const existingMatch = existingRows.find(product => rowMatchesWebsite(product, websiteProduct))
      const candidate = chooseCandidate(products, websiteProduct)
      if (existingMatch) {
        moveCodeFromOtherProducts(db, websiteProduct.code, existingMatch.id, changes)
        continue
      }

      if (candidate) {
        moveCodeFromOtherProducts(db, websiteProduct.code, candidate.id, changes)
        const oldCodes = [candidate.plu, candidate.barcode].map(v => String(v || '').trim()).filter(Boolean)
        run(db, `
          UPDATE products
          SET barcode = ?1,
              plu = ?1,
              price = CASE WHEN COALESCE(open_price, 0) = 1 THEN price ELSE ?2 END,
              unit = COALESCE(NULLIF(unit, ''), ?3),
              category_id = COALESCE(NULLIF(category_id, ''), ?4),
              active = 1,
              updated_at = datetime('now')
          WHERE id = ?5
        `, [websiteProduct.code, websiteProduct.price, websiteProduct.unit, websiteProduct.category_id, candidate.id])
        run(db, `
          UPDATE keyboard_buttons
          SET category_filter = ?1, updated_at = datetime('now')
          WHERE product_id = ?2
            AND category_filter IS NOT NULL
            AND TRIM(category_filter) != ''
        `, [websiteProduct.code, candidate.id])
        productsByCode.set(websiteProduct.code, [{ ...candidate, barcode: websiteProduct.code, plu: websiteProduct.code, active: 1 }])
        changes.push({ action: 'updated', code: websiteProduct.code, name: websiteProduct.name, product_id: candidate.id, old_codes: oldCodes })
      } else {
        const id = stableIdForCode(websiteProduct.code)
        moveCodeFromOtherProducts(db, websiteProduct.code, id, changes)
        run(db, `
          INSERT OR REPLACE INTO products
            (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, open_price, updated_at)
          VALUES
            (?1, ?2, ?2, ?3, ?4, ?5, 0, ?6, 0, 0, 0, 1, NULL, 0, datetime('now'))
        `, [id, websiteProduct.code, websiteProduct.name, websiteProduct.category_id, websiteProduct.price, websiteProduct.unit])
        productsByCode.set(websiteProduct.code, [{
          id,
          name: websiteProduct.name,
          barcode: websiteProduct.code,
          plu: websiteProduct.code,
          active: 1
        }])
        changes.push({ action: 'inserted', code: websiteProduct.code, name: websiteProduct.name, product_id: id })
      }
    }
    run(db, 'COMMIT')
  } catch (err) {
    try { run(db, 'ROLLBACK') } catch (_) {}
    throw err
  }

  const missingAfter = websiteProducts.filter(p => {
    const rows = execRows(db, 'SELECT id FROM products WHERE active = 1 AND (plu = ?1 OR barcode = ?1) LIMIT 1', [p.code])
    return rows.length === 0
  })
  if (missingAfter.length) throw new Error(`Still missing ${missingAfter.length} Fruit/Veg website codes in ${dbPath}`)

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.close()
  return { dbPath, changed: changes.length, changes }
}

async function main () {
  const websiteProducts = loadWebsiteFruitVeg()
  const duplicateCodes = new Map()
  for (const p of websiteProducts) {
    if (!duplicateCodes.has(p.code)) duplicateCodes.set(p.code, [])
    duplicateCodes.get(p.code).push(p.name)
  }
  const badDuplicates = [...duplicateCodes.entries()].filter(([, names]) => new Set(names.map(norm)).size > 1)
  if (badDuplicates.length) {
    throw new Error(`products.json has conflicting Fruit/Veg codes: ${JSON.stringify(badDuplicates.slice(0, 5))}`)
  }

  const SQL = await initSqlJs()
  const results = []
  for (const dbPath of dbTargets) {
    if (!fs.existsSync(dbPath)) continue
    results.push(reconcileDb(SQL, dbPath, websiteProducts))
  }
  console.log(JSON.stringify({
    websiteFruitVegProducts: websiteProducts.length,
    results
  }, null, 2))
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
