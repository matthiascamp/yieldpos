const fs = require('fs')
const path = require('path')

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const candidates = [
  path.join(appData, 'YieldPOS Client', 'crisp-pos.sqlite'),
  path.join(appData, 'BoundOS Client', 'crisp-pos.sqlite')
]

const source = candidates.find(p => fs.existsSync(p))
if (!source) {
  console.error('No runtime database found. Checked:')
  for (const p of candidates) console.error(`- ${p}`)
  process.exit(1)
}

const dest = path.join(__dirname, 'db', 'crisp-pos.sqlite')
const backup = path.join(__dirname, 'db', `crisp-pos.before-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)

fs.mkdirSync(path.dirname(dest), { recursive: true })
if (fs.existsSync(dest)) fs.copyFileSync(dest, backup)
fs.copyFileSync(source, dest)

console.log(`Bundled database updated from: ${source}`)
console.log(`Previous bundled database backed up to: ${backup}`)
