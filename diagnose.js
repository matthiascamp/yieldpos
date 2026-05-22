// Run: node diagnose.js
// Collects hardware info from this machine — copy/paste the output back

const { execSync } = require('child_process')

console.log('=== CRISP POS HARDWARE DIAGNOSTIC ===\n')
console.log('Platform:', process.platform, process.arch)
console.log('Node:', process.version)
console.log('')

// 1. Check installed npm modules
console.log('--- NPM MODULES ---')
const mods = ['usb', 'escpos', 'escpos-usb', 'serialport', 'node-thermal-printer']
for (const m of mods) {
  try {
    const pkg = require(`${m}/package.json`)
    console.log(`  ${m}: v${pkg.version} INSTALLED`)
  } catch (_) {
    console.log(`  ${m}: NOT INSTALLED`)
  }
}
console.log('')

// 2. Try native usb module
console.log('--- USB MODULE TEST ---')
try {
  const usb = require('usb')
  const devices = usb.getDeviceList()
  console.log(`  usb.getDeviceList(): ${devices.length} devices`)
  for (const d of devices) {
    const desc = d.deviceDescriptor
    console.log(`    VID:0x${desc.idVendor.toString(16).padStart(4,'0')} PID:0x${desc.idProduct.toString(16).padStart(4,'0')} Class:${desc.bDeviceClass}`)
  }
} catch (e) {
  console.log('  FAILED:', e.message)
}
console.log('')

// 3. Try escpos
console.log('--- ESCPOS MODULE TEST ---')
try {
  const escpos = require('escpos')
  console.log('  escpos keys:', Object.keys(escpos).join(', '))
  console.log('  escpos.USB:', typeof escpos.USB)
  console.log('  escpos.Printer:', typeof escpos.Printer)
  try {
    require('escpos-usb')
    console.log('  escpos-usb loaded, escpos.USB now:', typeof escpos.USB)
  } catch (e2) {
    console.log('  escpos-usb load failed:', e2.message)
  }
  if (typeof escpos.USB === 'function') {
    try {
      const dev = new escpos.USB()
      console.log('  new escpos.USB() SUCCESS:', dev)
    } catch (e3) {
      console.log('  new escpos.USB() FAILED:', e3.message)
    }
  }
} catch (e) {
  console.log('  FAILED:', e.message)
}
console.log('')

// 4. Windows PnP devices via PowerShell
console.log('--- WINDOWS PNP DEVICES ---')
try {
  const raw = execSync('powershell -NoProfile -Command "Get-PnpDevice -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.Class -in @(\'USB\',\'Printer\',\'HIDClass\',\'Ports\',\'PrintQueue\') } | Select-Object FriendlyName,InstanceId,Class,Status | ConvertTo-Json -Compress"', { timeout: 15000, encoding: 'utf-8' })
  const devices = JSON.parse(raw)
  const devList = Array.isArray(devices) ? devices : [devices]
  console.log(`  Found ${devList.length} devices:`)
  for (const d of devList) {
    console.log(`    [${d.Class}] ${d.FriendlyName}`)
    console.log(`      ID: ${d.InstanceId}`)
  }
} catch (e) {
  console.log('  FAILED:', e.message)
}
console.log('')

// 5. Windows printers via PowerShell
console.log('--- WINDOWS PRINTERS ---')
try {
  const raw = execSync('powershell -NoProfile -Command "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared | ConvertTo-Json -Compress"', { timeout: 10000, encoding: 'utf-8' })
  const printers = JSON.parse(raw)
  const list = Array.isArray(printers) ? printers : [printers]
  console.log(`  Found ${list.length} printers:`)
  for (const p of list) {
    console.log(`    Name: ${p.Name}`)
    console.log(`      Driver: ${p.DriverName}, Port: ${p.PortName}, Status: ${p.PrinterStatus}`)
  }
} catch (e) {
  console.log('  FAILED:', e.message)
}
console.log('')

// 6. Serial ports
console.log('--- SERIAL PORTS ---')
try {
  const raw = execSync('powershell -NoProfile -Command "Get-WmiObject Win32_SerialPort | Select-Object DeviceID,Name,Description | ConvertTo-Json -Compress"', { timeout: 10000, encoding: 'utf-8' })
  if (raw.trim()) {
    const ports = JSON.parse(raw)
    const list = Array.isArray(ports) ? ports : [ports]
    for (const p of list) console.log(`  ${p.DeviceID}: ${p.Name}`)
  } else {
    console.log('  None found')
  }
} catch (e) {
  console.log('  None found or error:', e.message)
}
console.log('')

console.log('=== END DIAGNOSTIC ===')
console.log('Copy everything above and paste it back.')
