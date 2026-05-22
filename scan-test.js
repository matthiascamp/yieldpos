// Standalone scanner probe - listens on every Datalogic HID interface
// and prints raw reports as you scan. Run while mcpos and/or PTPOS are running.
//
//   node scan-test.js
//
// Ctrl+C to exit.

const HID = require('node-hid')

const DATALOGIC_VID = 0x05F9

function fmt (buf) {
  const hex = buf.toString('hex').match(/.{1,2}/g).join(' ')
  const ascii = [...buf].map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')
  return { hex, ascii }
}

const all = HID.devices()
const dl = all.filter(d => d.vendorId === DATALOGIC_VID)

console.log('=== Datalogic devices found ===')
if (dl.length === 0) {
  console.log('  (none - is the scanner plugged in?)')
  console.log(`  Total HID devices on system: ${all.length}`)
  process.exit(1)
}

dl.forEach((d, i) => {
  console.log(`[${i}]  PID=0x${d.productId.toString(16).padStart(4, '0')}  iface=${d.interface}  usagePage=0x${(d.usagePage || 0).toString(16)}  usage=0x${(d.usage || 0).toString(16)}`)
  console.log(`     product:  ${d.product || '(none)'}`)
  console.log(`     path:     ${d.path}`)
})

console.log('\n=== Attempting to open each interface ===')
const opened = []
dl.forEach((d, i) => {
  try {
    const dev = new HID.HID(d.path)
    opened.push({ i, d, dev })
    console.log(`[${i}] OPEN OK  (iface ${d.interface})`)
    dev.on('data', buf => {
      const { hex, ascii } = fmt(buf)
      const ts = new Date().toISOString().slice(11, 23)
      console.log(`[${i}] ${ts}  ${hex}  |${ascii}|`)
    })
    dev.on('error', e => console.log(`[${i}] ERROR: ${e.message}`))
  } catch (e) {
    console.log(`[${i}] OPEN FAILED: ${e.message}`)
  }
})

if (opened.length === 0) {
  console.log('\nNo interface could be opened. The scanner may be claimed exclusively by another app (Profit Track / OPOS).')
  process.exit(1)
}

console.log(`\n=== Listening on ${opened.length} interface(s) - SCAN A BARCODE NOW ===`)
console.log('Ctrl+C to quit.\n')

process.on('SIGINT', () => {
  console.log('\nClosing...')
  opened.forEach(({ dev }) => { try { dev.close() } catch (_) {} })
  process.exit(0)
})

// keep event loop alive
setInterval(() => {}, 60000)
