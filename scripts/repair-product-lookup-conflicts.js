const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const defaultDbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const runtimeDbPath = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'YieldPOS Client', 'crisp-pos.sqlite')
  : null

const explicitTargets = process.argv.slice(2)
const dbTargets = explicitTargets.length
  ? explicitTargets.map(p => path.resolve(p))
  : [defaultDbPath, runtimeDbPath].filter(Boolean).filter((p, i, arr) => fs.existsSync(p) && arr.indexOf(p) === i)

function rows (db, sql, params = []) {
  const result = db.exec(sql, params)
  if (!result.length) return []
  return result[0].values.map(values => Object.fromEntries(result[0].columns.map((col, index) => [col, values[index]])))
}

function run (db, sql, params = []) {
  db.run(sql, params)
}

function activeLookupGroups (db) {
  const groups = new Map()
  for (const product of rows(db, `
    SELECT id, name, plu, barcode, active
    FROM products
    WHERE active = 1
  `)) {
    const codes = [...new Set([product.plu, product.barcode].map(v => String(v || '').trim()).filter(Boolean))]
    for (const code of codes) {
      if (!groups.has(code)) groups.set(code, new Map())
      groups.get(code).set(product.id, product)
    }
  }
  return [...groups.entries()]
    .map(([code, productMap]) => [code, [...productMap.values()]])
    .filter(([, products]) => products.length > 1)
}

function repairDb (SQL, dbPath) {
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const changes = []

  run(db, 'BEGIN')
  try {
    for (const [code, products] of activeLookupGroups(db)) {
      const pluOwners = products.filter(product => String(product.plu || '').trim() === code)
      if (pluOwners.length !== 1) {
        changes.push({
          action: 'review_required',
          code,
          products: products.map(product => ({ id: product.id, name: product.name, plu: product.plu, barcode: product.barcode }))
        })
        continue
      }

      const owner = pluOwners[0]
      for (const product of products) {
        if (product.id === owner.id) continue
        const replacementCode = String(product.plu || '').trim()
        if (String(product.barcode || '').trim() === code) {
          run(db, `
            UPDATE products
            SET barcode = CASE
                  WHEN ?2 != '' AND ?2 != ?1 THEN ?2
                  ELSE NULL
                END,
                updated_at = datetime('now')
            WHERE id = ?3
          `, [code, replacementCode, product.id])

          if (replacementCode && replacementCode !== code) {
            run(db, `
              UPDATE keyboard_buttons
              SET category_filter = ?1, updated_at = datetime('now')
              WHERE product_id = ?2
                AND category_filter = ?3
            `, [replacementCode, product.id, code])
          }

          changes.push({
            action: 'cleared_conflicting_barcode',
            code,
            kept_product_id: owner.id,
            kept_product_name: owner.name,
            updated_product_id: product.id,
            updated_product_name: product.name,
            replacement_code: replacementCode && replacementCode !== code ? replacementCode : ''
          })
        }
      }
    }
    run(db, 'COMMIT')
  } catch (err) {
    try { run(db, 'ROLLBACK') } catch (_) {}
    throw err
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  const remaining = activeLookupGroups(db)
  db.close()
  return { dbPath, changed: changes.filter(change => change.action !== 'review_required').length, reviewRequired: changes.filter(change => change.action === 'review_required').length, remainingConflicts: remaining.length, changes }
}

async function main () {
  const SQL = await initSqlJs()
  const reports = dbTargets.map(dbPath => repairDb(SQL, dbPath))
  console.log(JSON.stringify({ reports }, null, 2))
}

main().catch(err => {
  console.error(err.stack || err.message)
  process.exit(1)
})
