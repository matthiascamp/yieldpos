const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'pos', 'images')
const targets = [
  path.join(root, 'dist2', 'images'),
  path.join(root, 'dist2', 'win-unpacked', 'images')
]

if (!fs.existsSync(source)) {
  console.warn(`Image source folder not found: ${source}`)
  process.exit(0)
}

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
  console.log(`Copied external images to ${target}`)
}
