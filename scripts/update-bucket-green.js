const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

async function updateDb(file) {
  if (!fs.existsSync(file)) return { file, skipped: true }
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(file))
  db.run(`
    UPDATE keyboard_buttons
    SET bg_color = '#22c55e',
        color = '#111111',
        image = NULL,
        alpha_range = NULL,
        updated_at = datetime('now')
    WHERE upper(label) LIKE '%BUCKET%'
  `)
  db.run(`
    UPDATE keyboard_buttons
    SET bg_color = '#22c55e',
        color = '#000000',
        updated_at = datetime('now')
    WHERE id IN ('pg6-back', 'pg37-back', 'pg38-back')
      AND bg_color = '#39ff14'
  `)
  fs.writeFileSync(file, Buffer.from(db.export()))
  db.close()
  return { file, skipped: false }
}

async function main() {
  const files = process.argv.slice(2)
  const targets = files.length ? files : [path.join(__dirname, '..', 'db', 'crisp-pos.sqlite')]
  for (const target of targets) {
    const result = await updateDb(path.resolve(target))
    console.log(result.skipped ? `Skipped missing DB: ${result.file}` : `Updated bucket green: ${result.file}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
