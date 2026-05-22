const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await require('sql.js')();
  const targets = process.argv.slice(2);
  const dbPaths = targets.length ? targets : [path.join(__dirname, '..', 'db', 'crisp-pos.sqlite')];

  for (const dbPath of dbPaths) {
    if (!fs.existsSync(dbPath)) {
      console.warn(`skip missing db: ${dbPath}`);
      continue;
    }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const productRows = query(db, `
      SELECT id, plu, barcode, name
      FROM products
      WHERE active = 1 AND plu IS NOT NULL AND TRIM(plu) != ''
      ORDER BY plu, id
    `);
    const refRows = query(db, `
      SELECT product_id, COUNT(*) AS uses
      FROM keyboard_buttons
      WHERE active = 1 AND product_id IS NOT NULL AND TRIM(product_id) != ''
      GROUP BY product_id
    `);
    const refs = new Map(refRows.map(row => [row.product_id, Number(row.uses || 0)]));
    const byPlu = new Map();
    for (const row of productRows) {
      const plu = String(row.plu || '').trim();
      if (!byPlu.has(plu)) byPlu.set(plu, []);
      byPlu.get(plu).push(row);
    }

    const started = db.exec('BEGIN TRANSACTION');
    void started;
    let repaired = 0;
    const notes = [];
    for (const [plu, rows] of byPlu) {
      if (rows.length < 2) continue;
      rows.sort((a, b) => scoreProduct(b, refs) - scoreProduct(a, refs) || String(a.id).localeCompare(String(b.id)));
      const keeper = rows[0];
      for (const loser of rows.slice(1)) {
        const sameName = normalizeName(loser.name) === normalizeName(keeper.name);
        const loserRefs = refs.get(loser.id) || 0;
        if (sameName && loserRefs > 0) {
          run(db, 'UPDATE keyboard_buttons SET product_id = ? WHERE product_id = ?', [keeper.id, loser.id]);
        }
        if (sameName || loserRefs === 0) {
          run(db, "UPDATE products SET active = 0, plu = NULL, barcode = NULL, updated_at = datetime('now') WHERE id = ?", [loser.id]);
          notes.push(`${plu}: deactivated duplicate ${loser.id} (${loser.name})`);
        } else {
          run(db, "UPDATE products SET plu = NULL, barcode = NULL, updated_at = datetime('now') WHERE id = ?", [loser.id]);
          notes.push(`${plu}: cleared PLU from referenced duplicate ${loser.id} (${loser.name}); kept ${keeper.id} (${keeper.name})`);
        }
        repaired++;
      }
    }
    run(db, 'COMMIT');

    if (repaired) {
      run(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_plu_unique ON products(plu) WHERE plu IS NOT NULL AND TRIM(plu) != ''");
      run(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND TRIM(barcode) != ''");
      fs.writeFileSync(dbPath, Buffer.from(db.export()));
    }
    console.log(`${dbPath}: repaired ${repaired} duplicate product PLU row(s)`);
    for (const note of notes) console.log(`  - ${note}`);
    db.close();
  }
}

function scoreProduct(row, refs) {
  let score = refs.get(row.id) || 0;
  if (String(row.id).startsWith('p-kb-')) score += 100;
  if (String(row.id).startsWith('p-open-')) score += 20;
  if (String(row.id).startsWith('prod-')) score += 5;
  return score;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
