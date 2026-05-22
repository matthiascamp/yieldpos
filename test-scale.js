// Quick standalone test for Mettler Toledo Ariva-S / VIVA scale
// Run: node test-scale.js [COM_PORT] [BAUD]
// Default: COM2 9600 (confirmed via diagnostic on POSLANE04)

const { SerialPort } = require('serialport')

const comPort = process.argv[2] || 'COM2'
const baud = parseInt(process.argv[3] || '9600')
const bits = parseInt(process.argv[4] || '7')

console.log(`Opening ${comPort} at ${baud} baud (${bits}-E-1)...`)
console.log(`Settings: dataBits=${bits}, parity=even, stopBits=1, command=W`)
console.log('Usage: node test-scale.js [COM] [BAUD] [DATABITS]')
console.log('  Try: node test-scale.js COM2 9600 7')
console.log('  Try: node test-scale.js COM2 9600 8')
console.log('')

const port = new SerialPort({
  path: comPort,
  baudRate: baud,
  dataBits: bits,
  parity: 'even',
  stopBits: 1,
  autoOpen: false,
})

function parseWeight (data) {
  if (!data || data.length < 1) return { ok: false, error: 'Empty response' }

  const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')
  const ascii = data.toString('ascii').replace(/[^\x20-\x7e]/g, '?')

  // Try standard 8217: first byte = status, rest = digits
  if (data.length >= 2) {
    const status = data[0]
    const inMotion = !!(status & 0x01)
    const overCap = !!(status & 0x40)
    const underZero = !!(status & 0x20)
    const negative = !!(status & 0x10)
    const weightStr = data.slice(1).toString('ascii').replace(/[^0-9]/g, '')

    if (weightStr) {
      let weight = parseInt(weightStr, 10) / 1000
      if (negative) weight = -weight
      return {
        ok: true, weight: weight.toFixed(3), unit: 'kg',
        stable: !inMotion,
        status: overCap ? 'OVER' : underZero ? 'UNDER' : inMotion ? 'MOVING' : 'STABLE',
        statusByte: '0x' + status.toString(16).padStart(2, '0'),
        hex, ascii,
      }
    }
  }

  // Fallback: extract any digits
  const allDigits = data.toString('ascii').replace(/[^0-9.-]/g, '')
  if (allDigits) {
    let weight = parseFloat(allDigits)
    if (!isNaN(weight)) {
      if (Number.isInteger(weight) && weight > 100) weight = weight / 1000
      return { ok: true, weight: weight.toFixed(3), unit: 'kg', status: 'PARSED', hex, ascii }
    }
  }

  return { ok: false, error: 'Could not parse weight', hex, ascii }
}

port.open(err => {
  if (err) { console.error('FAILED:', err.message); process.exit(1) }
  console.log('Port open. Sending W command every 500ms...')
  console.log('Press Ctrl+C to stop.\n')

  // Enable DTR/RTS
  port.set({ dtr: true, rts: true }, () => {})

  let frameBuf = []
  let inFrame = false
  let silenceTimer = null

  const processFrame = (buf) => {
    const result = parseWeight(Buffer.from(buf))
    const ts = new Date().toLocaleTimeString()
    if (result.ok) {
      console.log(`[${ts}] ${result.weight} ${result.unit} (${result.status}) status=${result.statusByte || 'n/a'} hex=[${result.hex}] ascii=[${result.ascii}]`)
    } else {
      console.log(`[${ts}] ERROR: ${result.error} hex=[${result.hex}] ascii=[${result.ascii || 'n/a'}]`)
    }
  }

  port.on('data', chunk => {
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ')
    console.log(`  [chunk] ${hex}`)

    for (const byte of chunk) {
      if (byte === 0x02) { inFrame = true; frameBuf = []; continue }
      if (inFrame) {
        if (byte === 0x0D) {
          inFrame = false
          processFrame(frameBuf)
          frameBuf = []
        } else {
          frameBuf.push(byte)
        }
        continue
      }
      frameBuf.push(byte)
      if (byte === 0x0D || byte === 0x0A || byte === 0x03) {
        if (frameBuf.length > 1) processFrame(frameBuf.slice(0, -1))
        frameBuf = []
        continue
      }
    }

    if (frameBuf.length > 0 && !inFrame) {
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => {
        if (frameBuf.length > 0) {
          processFrame(frameBuf)
          frameBuf = []
        }
      }, 50)
    }
  })

  // Send W every 500ms. This Viva firmware returns a weight frame for uppercase
  // W; lowercase w can return status-only frames.
  setInterval(() => {
    port.write('W', 'ascii', () => { port.drain(() => {}) })
  }, 500)

  port.on('error', err => console.error('PORT ERROR:', err.message))
  port.on('close', () => { console.log('Port closed'); process.exit(0) })
})

process.on('SIGINT', () => { port.close(); process.exit(0) })
