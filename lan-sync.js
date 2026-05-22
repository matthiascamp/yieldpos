// ─── LAN Multi-Register Sync ─────────────────────────────────────────────────
// Server: exposes local DB via HTTP JSON API for client registers
// Client: syncs master data from server, pushes transactions to server
// No npm dependencies — uses Node.js built-in http and dgram modules

const http = require('http')
const dgram = require('dgram')
const os = require('os')

const UDP_PORT = 5556
const SYNC_INTERVAL = 3000 // 3 seconds — fast version check, full pull only when changed

let server = null
let udpSocket = null
let udpBroadcastTimer = null
let clientSyncTimer = null
let db = null // { dbAll, dbGet, dbRun, saveDB, uuid }

let dataVersion = 0 // bumps on any server-side data change
let lastKnownVersion = -1 // client tracks server version to skip unchanged polls

let state = {
  mode: 'off',       // 'off' | 'server' | 'client'
  connected: false,
  lastPull: null,
  lastPush: null,
  serverIp: null,
  port: 5555,
  secret: null,
  error: null,
  clients: [],        // server tracks connected client IPs
  activeSessions: {}  // server tracks active staff: { staffId: { registerId, staffName, loginTime } }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { startServer, startClient, stopAll, getStatus, testConnection, discoverServer, networkDiagnostic, bumpVersion, forceSync, onDataChanged, getPeers, sessionAction }

let _dataChangedCallback = null
function onDataChanged (cb) { _dataChangedCallback = cb }

function bumpVersion () {
  dataVersion++
  broadcastServerNow()
}

async function forceSync () {
  if (state.mode === 'server') {
    bumpVersion()
    return { ok: true, mode: state.mode, clients: state.clients.length }
  }
  if (state.mode === 'client') {
    await doSyncCycle()
    await attemptInitialSync()
    return { ok: state.connected, mode: state.mode, lastPull: state.lastPull, lastPush: state.lastPush, error: state.error }
  }
  return { ok: false, mode: state.mode, error: 'LAN sync is off' }
}

const LOCAL_ONLY_SETTINGS = new Set([
  'lan_mode', 'lan_server_ip', 'lan_port', 'lan_secret', 'register_id',
  'keyboard_grid_cols', 'keyboard_grid_rows', 'app_mode', 'lan_autostart', 'lan_last_pull',
  'hardware_config_version',
  'hw_printer_interface', 'hw_printer_name', 'hw_printer_port', 'hw_printer_ip', 'hw_printer_network_port',
  'hw_scale_path', 'hw_scale_type', 'hw_scale_port', 'hw_scale_baud', 'hw_scale_protocol', 'hw_scale_use_python',
  'hw2_printer_interface', 'hw2_printer_name', 'hw2_printer_port', 'hw2_printer_ip', 'hw2_printer_network_port',
  'hw2_scale_path', 'hw2_scale_type', 'hw2_scale_port', 'hw2_scale_baud', 'hw2_scale_protocol', 'hw2_scale_use_python',
  'opos_cached_result', 'opos_printer_name', 'opos_drawer_name', 'opos_scale_name', 'opos_scanner_name',
  'opos2_cached_result', 'opos2_printer_name', 'opos2_drawer_name', 'opos2_scale_name', 'opos2_scanner_name',
  'scanner_opos_unavailable'
])

function isLocalOnlySetting (key) {
  return LOCAL_ONLY_SETTINGS.has(key)
}

const MASTER_TABLE_COLUMNS = {
  products: ['id', 'barcode', 'plu', 'name', 'category_id', 'price', 'cost_price', 'unit', 'tax_rate', 'track_stock', 'stock_qty', 'active', 'image_url', 'open_price', 'updated_at'],
  categories: ['id', 'name', 'sort_order', 'colour', 'family', 'active', 'updated_at'],
  specials: ['id', 'product_id', 'special_price', 'start_date', 'end_date', 'active', 'updated_at'],
  deals: ['id', 'name', 'type', 'config', 'start_date', 'end_date', 'active', 'updated_at'],
  staff: ['id', 'name', 'pin', 'role', 'active', 'updated_at'],
  keyboard_buttons: ['id', 'label', 'type', 'price', 'image', 'image_scale', 'color', 'bg_color', 'parent_id', 'category_filter', 'alpha_range', 'sort_order', 'position', 'page', 'grid_row', 'grid_col', 'col_span', 'row_span', 'product_id', 'active', 'updated_at'],
  keyboard_pages: ['page', 'name', 'cols', 'rows']
}

function upsertWhitelistedRecord (table, payload) {
  if (table === 'settings') {
    if (!payload || !payload.key) return false
    if (isLocalOnlySetting(payload.key)) return false
    db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [payload.key, payload.value ?? null])
    return true
  }

  if (table === 'deal_products') {
    if (!payload || !payload.deal_id || !payload.product_id) return false
    db.dbRun("INSERT OR REPLACE INTO deal_products (deal_id, product_id, role) VALUES (?1, ?2, ?3)",
      [payload.deal_id, payload.product_id, payload.role || 'trigger'])
    return true
  }

  const cols = MASTER_TABLE_COLUMNS[table]
  if (!cols || !payload) return false
  const present = cols.filter(c => payload[c] !== undefined)
  if (!present.length) return false
  const placeholders = present.map((_, i) => `?${i + 1}`).join(', ')
  db.dbRun(`INSERT OR REPLACE INTO ${table} (${present.join(', ')}) VALUES (${placeholders})`,
    present.map(c => payload[c]))
  return true
}

function getStatus () {
  const now = Date.now()
  state.clients = state.clients.filter(c => {
    const age = now - new Date(c.lastSeen).getTime()
    return age < 5 * 60 * 1000
  })
  const localIp = getLocalIp()
  return {
    ...state,
    localIp,
    serverIp: state.serverIp || (state.mode === 'server' ? localIp : state.serverIp)
  }
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function jsonReply (res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function getLocalIp () {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Node.js 18+ uses family=4 (number), older uses family='IPv4' (string)
      const isIPv4 = net.family === 'IPv4' || net.family === 4
      if (isIPv4 && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

// ─── Server ──────────────────────────────────────────────────────────────────

function startServer (port, dbHelpers) {
  db = dbHelpers
  state.mode = 'server'
  state.port = port
  state.serverIp = getLocalIp()

  // Generate secret if not set
  let secretRow = db.dbGet("SELECT value FROM settings WHERE key = 'lan_secret'")
  if (!secretRow || !secretRow.value) {
    const secret = db.uuid()
    db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_secret', ?1)", [secret])
    state.secret = secret
  } else {
    state.secret = secretRow.value
  }

  server = http.createServer(async (req, res) => {
    // CORS for safety
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-POS-Secret, X-Register-Id')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // Auth check (skip heartbeat so test works without secret)
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.pathname

    if (path !== '/api/heartbeat') {
      const reqSecret = req.headers['x-pos-secret']
      if (reqSecret !== state.secret) {
        return jsonReply(res, { error: 'Unauthorized' }, 401)
      }
    }

    // Track client
    const clientIp = req.socket.remoteAddress
    const registerId = req.headers['x-register-id'] || 'unknown'
    if (clientIp && !state.clients.find(c => c.ip === clientIp)) {
      state.clients.push({ ip: clientIp, registerId, lastSeen: new Date().toISOString() })
    } else if (clientIp) {
      const c = state.clients.find(c => c.ip === clientIp)
      if (c) { c.lastSeen = new Date().toISOString(); c.registerId = registerId }
    }

    try {
      await handleRoute(req, res, url, path)
    } catch (e) {
      console.error('LAN API error:', e.message)
      jsonReply(res, { error: e.message }, 500)
    }
  })

  server.on('error', e => {
    console.error('LAN server error:', e.message)
    state.error = e.message
    state.connected = false
  })

  server.listen(port, '0.0.0.0', () => {
    state.serverIp = getLocalIp()
    db?.dbRun?.("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_server_ip', ?1)", [state.serverIp])
    console.log(`LAN server started on port ${port} (IP: ${state.serverIp})`)
    state.connected = true
    state.error = null
  })

  // UDP discovery broadcast
  startUdpBroadcast(port)
}

async function handleRoute (req, res, url, path) {
  const since = url.searchParams.get('since') || '1970-01-01T00:00:00'

  // ── GET endpoints (master data) ──
  if (req.method === 'GET') {
    switch (path) {
      case '/api/heartbeat':
        return jsonReply(res, { ok: true, time: new Date().toISOString(), ip: getLocalIp(), port: state.port, version: dataVersion, secret: state.secret })

      case '/api/peers': {
        const regRow = db.dbGet("SELECT value FROM settings WHERE key = 'register_id'")
        const serverName = regRow?.value || 'Server'
        const peers = [
          { registerId: serverName, ip: getLocalIp(), role: 'server', lastSeen: new Date().toISOString() },
          ...state.clients.map(c => ({ registerId: c.registerId || 'Register', ip: c.ip, role: 'client', lastSeen: c.lastSeen }))
        ]
        return jsonReply(res, peers)
      }

      case '/api/session': {
        return jsonReply(res, state.activeSessions)
      }

      case '/api/version':
        return jsonReply(res, { version: dataVersion, serverTime: new Date().toISOString() })

      case '/api/products':
        return jsonReply(res, db.dbAll(
          "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.updated_at > ?1", [since]))

      case '/api/categories':
        return jsonReply(res, db.dbAll("SELECT * FROM categories WHERE updated_at > ?1", [since]))

      case '/api/specials':
        return jsonReply(res, db.dbAll("SELECT * FROM specials WHERE updated_at > ?1", [since]))

      case '/api/deals':
        return jsonReply(res, db.dbAll("SELECT * FROM deals WHERE updated_at > ?1", [since]))

      case '/api/deal_products':
        return jsonReply(res, db.dbAll("SELECT * FROM deal_products"))

      case '/api/staff':
        return jsonReply(res, db.dbAll("SELECT * FROM staff WHERE updated_at > ?1", [since]))

      case '/api/keyboard': {
        const delRows = db.dbAll("SELECT record_id FROM deleted_records WHERE table_name = 'keyboard_buttons'")
        const delIds = new Set(delRows.map(r => r.record_id))
        const btns = db.dbAll("SELECT * FROM keyboard_buttons").filter(b => !delIds.has(b.id))
        return jsonReply(res, btns)
      }

      case '/api/keyboard_pages': {
        let kbPages = []
        try { kbPages = db.dbAll("SELECT * FROM keyboard_pages ORDER BY page") } catch (_) {}
        return jsonReply(res, kbPages)
      }

      case '/api/settings': {
        const rows = db.dbAll("SELECT key, value FROM settings")
        const obj = {}
        for (const r of rows) obj[r.key] = r.value
        return jsonReply(res, obj)
      }

      case '/api/full-sync': {
        const delKb = db.dbAll("SELECT record_id FROM deleted_records WHERE table_name = 'keyboard_buttons'")
        const delKbIds = new Set(delKb.map(r => r.record_id))
        let kbPages = []
        try { kbPages = db.dbAll("SELECT * FROM keyboard_pages ORDER BY page") } catch (_) {}
        return jsonReply(res, {
          products: db.dbAll("SELECT * FROM products"),
          categories: db.dbAll("SELECT * FROM categories"),
          specials: db.dbAll("SELECT * FROM specials"),
          deals: db.dbAll("SELECT * FROM deals"),
          deal_products: db.dbAll("SELECT * FROM deal_products"),
          staff: db.dbAll("SELECT * FROM staff"),
          keyboard_buttons: db.dbAll("SELECT * FROM keyboard_buttons").filter(b => !delKbIds.has(b.id)),
          keyboard_pages: kbPages,
          deleted_records: db.dbAll("SELECT table_name, record_id FROM deleted_records"),
          settings: (() => {
            const rows = db.dbAll("SELECT key, value FROM settings")
            const obj = {}
            for (const r of rows) obj[r.key] = r.value
            return obj
          })()
        })
      }

      default:
        return jsonReply(res, { error: 'Not found' }, 404)
    }
  }

  // ── POST endpoints (client pushes) ──
  if (req.method === 'POST') {
    const body = await readBody(req)

    switch (path) {
      case '/api/transactions': {
        // Insert transaction + items + payments (same logic as db:transaction:save)
        const txn = body
        const txnId = txn.id || db.uuid()

        db.dbRun(`
          INSERT OR IGNORE INTO transactions (id, register_id, staff_id, customer_name, subtotal, tax, discount, total, status, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        `, [txnId, txn.register_id || 'REMOTE', txn.staff_id || null, txn.customer_name || null,
            txn.subtotal, txn.tax, txn.discount || 0, txn.total, txn.status || 'completed',
            txn.created_at || new Date().toISOString()])

        if (txn.items) {
          for (const item of txn.items) {
            db.dbRun(`
              INSERT OR IGNORE INTO transaction_items (id, transaction_id, product_id, name, qty, unit_price, discount, line_total, tax, deal_id)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            `, [item.id || db.uuid(), txnId, item.product_id || null, item.name, item.qty,
                item.unit_price, item.discount || 0, item.line_total, item.tax || 0, item.deal_id || null])
          }
        }

        if (txn.payments) {
          for (const pay of txn.payments) {
            db.dbRun(`
              INSERT OR IGNORE INTO payments (id, transaction_id, method, amount, reference, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            `, [pay.id || db.uuid(), txnId, pay.method, pay.amount, pay.reference || null,
                pay.created_at || new Date().toISOString()])
          }
        }

        // Decrement stock on server
        if (txn.status !== 'voided' && txn.items) {
          for (const item of txn.items) {
            if (item.product_id) {
              db.dbRun("UPDATE products SET stock_qty = stock_qty - ?1 WHERE id = ?2 AND track_stock = 1",
                       [item.qty, item.product_id])
            }
          }
        }

        db.saveDB()
        return jsonReply(res, { ok: true, id: txnId })
      }

      case '/api/cash_drawer': {
        const entry = body
        db.dbRun(`
          INSERT OR IGNORE INTO cash_drawer (id, register_id, staff_id, action, amount, note, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `, [entry.id || db.uuid(), entry.register_id || 'REMOTE', entry.staff_id || null,
            entry.action, entry.amount || null, entry.note || null,
            entry.created_at || new Date().toISOString()])
        db.saveDB()
        return jsonReply(res, { ok: true })
      }

      case '/api/session': {
        const { staffId, staffName, registerId: regId, action: sessAction } = body || {}
        if (sessAction === 'login') {
          const existing = state.activeSessions[staffId]
          if (existing && existing.registerId !== regId) {
            return jsonReply(res, { allowed: false, error: `${staffName || 'This user'} is already logged in on ${existing.registerId}` })
          }
          state.activeSessions[staffId] = { registerId: regId, staffName: staffName || '', loginTime: new Date().toISOString() }
          return jsonReply(res, { allowed: true })
        }
        if (sessAction === 'logout') {
          if (staffId) delete state.activeSessions[staffId]
          return jsonReply(res, { ok: true })
        }
        if (sessAction === 'logout_register') {
          for (const [sid, sess] of Object.entries(state.activeSessions)) {
            if (sess.registerId === regId) delete state.activeSessions[sid]
          }
          return jsonReply(res, { ok: true })
        }
        return jsonReply(res, { error: 'Invalid session action' }, 400)
      }

      case '/api/deleted': {
        const ALLOWED_TABLES = new Set(['products','categories','specials','deals','deal_products','staff','keyboard_buttons','keyboard_pages','transactions','transaction_items','payments','cash_drawer'])
        const records = Array.isArray(body) ? body : body.records || []
        for (const r of records) {
          if (!r.table_name || !r.record_id) continue
          if (!ALLOWED_TABLES.has(r.table_name)) continue
          db.dbRun("INSERT OR IGNORE INTO deleted_records (table_name, record_id) VALUES (?1, ?2)",
                   [r.table_name, r.record_id])
          if (r.table_name === 'keyboard_pages') db.dbRun("DELETE FROM keyboard_pages WHERE page = ?1", [r.record_id])
          else if (r.table_name === 'deal_products') {
            const [dealId, productId] = String(r.record_id).split(':')
            if (dealId && productId) db.dbRun("DELETE FROM deal_products WHERE deal_id = ?1 AND product_id = ?2", [dealId, productId])
          } else db.dbRun(`DELETE FROM ${r.table_name} WHERE id = ?1`, [r.record_id])
        }
        db.saveDB()
        bumpVersion()
        if (_dataChangedCallback) _dataChangedCallback()
        return jsonReply(res, { ok: true, count: records.length })
      }

      case '/api/master-data': {
        const records = Array.isArray(body) ? body : body.records || [body]
        let applied = 0
        for (const item of records) {
          const table = item.table_name
          const action = item.action || 'update'
          const payload = item.payload || item
          if (action === 'delete') continue
          if (upsertWhitelistedRecord(table, payload)) applied++
        }
        if (applied > 0) {
          db.saveDB()
          bumpVersion()
          if (_dataChangedCallback) _dataChangedCallback()
        }
        return jsonReply(res, { ok: true, count: applied })
      }

      default:
        return jsonReply(res, { error: 'Not found' }, 404)
    }
  }

  jsonReply(res, { error: 'Method not allowed' }, 405)
}

// ─── UDP Discovery ───────────────────────────────────────────────────────────

function startUdpBroadcast (port) {
  try {
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    udpSocket.bind(() => {
      udpSocket.setBroadcast(true)
      const regRow = db.dbGet("SELECT value FROM settings WHERE key = 'register_id'")
      const msg = JSON.stringify({
        service: 'crisp-pos',
        ip: getLocalIp(),
        port,
        register_id: regRow?.value || 'LANE01',
        secret: state.secret,
        version: dataVersion
      })
      const buf = Buffer.from(msg)

      udpBroadcastTimer = setInterval(() => {
        try {
          // Rebuild buffer each broadcast so DHCP IP changes are picked up
          const currentIp = getLocalIp()
          const freshMsg = JSON.stringify({
            service: 'crisp-pos',
            ip: currentIp,
            port,
            register_id: regRow?.value || 'LANE01',
            secret: state.secret,
            version: dataVersion
          })
          const freshBuf = Buffer.from(freshMsg)
          state.serverIp = currentIp
          udpSocket.send(freshBuf, 0, freshBuf.length, UDP_PORT, '255.255.255.255')
        }
        catch (_) {}
      }, 5000)

      // Send immediately too
      try { udpSocket.send(buf, 0, buf.length, UDP_PORT, '255.255.255.255') } catch (_) {}
    })
    udpSocket.on('error', () => {}) // Ignore UDP errors
  } catch (_) {}
}

function broadcastServerNow () {
  if (state.mode !== 'server' || !udpSocket) return
  try {
    const regRow = db?.dbGet("SELECT value FROM settings WHERE key = 'register_id'")
    const msg = JSON.stringify({
      service: 'crisp-pos',
      ip: getLocalIp(),
      port: state.port,
      register_id: regRow?.value || 'LANE01',
      secret: state.secret,
      version: dataVersion
    })
    const buf = Buffer.from(msg)
    udpSocket.send(buf, 0, buf.length, UDP_PORT, '255.255.255.255')
  } catch (_) {}
}

function startUdpListener (onDiscover) {
  try {
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    udpSocket.bind(UDP_PORT, () => {
      udpSocket.setBroadcast(true)
    })
    udpSocket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString())
        if (data.service === 'crisp-pos' && data.ip && data.port) {
          onDiscover(data)
        }
      } catch (_) {}
    })
    udpSocket.on('error', () => {})
  } catch (_) {}
}

// ─── Client ──────────────────────────────────────────────────────────────────

function startClient (serverIp, port, secret, dbHelpers) {
  db = dbHelpers
  state.mode = 'client'
  state.serverIp = serverIp
  state.port = port
  state.secret = secret

  // Initial full sync with retry
  attemptInitialSync()

  let syncInProgress = false
  let syncAgain = false
  const runSyncNow = () => {
    if (syncInProgress) {
      syncAgain = true
      return
    }
    syncInProgress = true
    doSyncCycle().catch(e => {
      console.error('LAN sync error:', e.message)
      state.error = e.message
      state.connected = false
    }).finally(() => {
      syncInProgress = false
      if (syncAgain) {
        syncAgain = false
        setTimeout(runSyncNow, 50)
      }
    })
  }

  // Periodic sync loop (also serves as reconnection)
  clientSyncTimer = setInterval(runSyncNow, SYNC_INTERVAL)

  // UDP listener for server discovery — auto-update IP/secret if server changes
  startUdpListener(data => {
    let changed = false
    if (data.ip !== state.serverIp) {
      console.log(`LAN: server moved to ${data.ip}:${data.port}`)
      state.serverIp = data.ip
      state.port = data.port
      changed = true
    }
    if (data.secret && data.secret !== state.secret) {
      console.log('LAN: server secret updated')
      state.secret = data.secret
      changed = true
    }
    if (changed && db) {
      db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_server_ip', ?1)", [data.ip])
      db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_port', ?1)", [String(data.port)])
      if (data.secret) db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_secret', ?1)", [data.secret])
      db.saveDB()
      if (!state.connected) attemptInitialSync()
    }
    if (typeof data.version === 'number' && data.version !== lastKnownVersion) {
      runSyncNow()
    }
  })
}

function attemptInitialSync (retries = 0) {
  doFullSync().then(() => {
    console.log('LAN client: initial sync complete')
  }).catch(e => {
    console.error(`LAN client: sync attempt ${retries + 1} failed:`, e.message)
    state.error = e.message
    state.connected = false
    // Retry with backoff: 5s, 10s, 20s, then every 30s via the regular interval
    if (retries < 3) {
      const delay = Math.min(5000 * Math.pow(2, retries), 20000)
      setTimeout(() => attemptInitialSync(retries + 1), delay)
    }
  })
}

async function refreshSecret () {
  try {
    const hb = await testConnection(state.serverIp, state.port)
    if (hb.ok && hb.secret) {
      state.secret = hb.secret
      if (db) {
        db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_secret', ?1)", [hb.secret])
        db.saveDB()
      }
      console.log('LAN: secret refreshed from server heartbeat')
      return true
    }
  } catch (_) {}
  return false
}

async function doFullSync () {
  let data
  try {
    data = await httpGet('/api/full-sync', 30000)
  } catch (e) {
    // If 401 Unauthorized, try refreshing secret from heartbeat and retry once
    if (e.message.includes('Unauthorized') || e.message.includes('401')) {
      const refreshed = await refreshSecret()
      if (refreshed) {
        data = await httpGet('/api/full-sync', 30000)
      } else {
        throw e
      }
    } else {
      throw e
    }
  }

  // Upsert all master data into local DB (no queueSync — don't re-push to server)
  if (data.categories) {
    for (const c of data.categories) {
      db.dbRun(`INSERT OR REPLACE INTO categories (id, name, sort_order, colour, family, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
               [c.id, c.name, c.sort_order || 0, c.colour || '#4fbd77', c.family || '', c.active ?? 1, c.updated_at || null])
    }
  }

  if (data.products) {
    for (const p of data.products) {
      db.dbRun(`INSERT OR REPLACE INTO products (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, open_price, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
               [p.id, p.barcode || null, p.plu || null, p.name, p.category_id || null,
                p.price, p.cost_price || null, p.unit || 'each', p.tax_rate ?? 0.10,
                p.track_stock || 0, p.stock_qty || 0, p.active ?? 1, p.image_url || null,
                p.open_price ? 1 : 0, p.updated_at || null])
    }
  }

  if (data.specials) {
    for (const s of data.specials) {
      db.dbRun(`INSERT OR REPLACE INTO specials (id, product_id, special_price, start_date, end_date, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
               [s.id, s.product_id, s.special_price, s.start_date || null, s.end_date || null, s.active ?? 1, s.updated_at || null])
    }
  }

  if (data.deals) {
    for (const d of data.deals) {
      db.dbRun(`INSERT OR REPLACE INTO deals (id, name, type, config, start_date, end_date, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
               [d.id, d.name, d.type, d.config, d.start_date || null, d.end_date || null, d.active ?? 1, d.updated_at || null])
    }
  }

  if (data.deal_products) {
    db.dbRun("DELETE FROM deal_products")
    for (const dp of data.deal_products) {
      db.dbRun("INSERT OR IGNORE INTO deal_products (deal_id, product_id, role) VALUES (?1, ?2, ?3)",
               [dp.deal_id, dp.product_id, dp.role || 'trigger'])
    }
  }

  if (data.staff) {
    for (const s of data.staff) {
      db.dbRun(`INSERT OR REPLACE INTO staff (id, name, pin, role, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
               [s.id, s.name, s.pin, s.role || 'cashier', s.active ?? 1, s.updated_at || null])
    }
  }

  // Merge server deleted_records into local — prevents resurrecting items deleted on server
  if (data.deleted_records) {
    db.dbRun("DELETE FROM deleted_records")
    for (const r of data.deleted_records) {
      db.dbRun("INSERT OR IGNORE INTO deleted_records (table_name, record_id) VALUES (?1, ?2)",
               [r.table_name, r.record_id])
    }
  }

  if (data.keyboard_buttons) {
    db.dbRun("DELETE FROM keyboard_buttons")

    // Full replace from server: keyboard layout, size, image and product links are server-owned.
    for (const b of data.keyboard_buttons) {
      db.dbRun(`INSERT OR REPLACE INTO keyboard_buttons (id, label, type, price, image, image_scale, color, bg_color, parent_id, category_filter, alpha_range, sort_order, position, page, grid_row, grid_col, col_span, row_span, product_id, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`,
               [b.id, b.label, b.type, b.price || null, b.image || null, Number(b.image_scale || 100) || 100, b.color || '#fff',
                b.bg_color || '#1a3d2a', b.parent_id || null, b.category_filter || null,
                b.alpha_range || null, b.sort_order || 0, b.position || 'grid',
                b.page || 1, b.grid_row || 0, b.grid_col || 0, b.col_span || 1, b.row_span || 1,
                b.product_id || null, b.active ?? 1, b.updated_at || null])
    }

  }

  if (data.keyboard_pages && data.keyboard_pages.length > 0) {
    db.dbRun("DELETE FROM keyboard_pages")
    for (const pg of data.keyboard_pages) {
      db.dbRun(`INSERT OR REPLACE INTO keyboard_pages (page, name, cols, rows)
                VALUES (?1, ?2, ?3, ?4)`,
               [pg.page, pg.name || ('Page ' + pg.page), pg.cols || 10, pg.rows || 7])
    }
  }

  if (data.settings) {
    // Sync shared settings but preserve local-only ones
    for (const [key, value] of Object.entries(data.settings)) {
      if (!isLocalOnlySetting(key)) {
        db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [key, value])
      }
    }
  }

  state.connected = true
  state.lastPull = new Date().toISOString()
  state.error = null
  if (typeof data.version === 'number') lastKnownVersion = data.version

  // Store last pull timestamp
  db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_last_pull', ?1)", [state.lastPull])
  db.saveDB()

  if (_dataChangedCallback) _dataChangedCallback()
}

async function doSyncCycle () {
  // Step 0: Quick version check — skip full pull if server data hasn't changed
  let serverVersion = null
  let serverTime = null
  try {
    const vRes = await httpGet('/api/version', 3000)
    serverVersion = vRes.version
    serverTime = vRes.serverTime || null
    state.connected = true
    state.error = null
  } catch (e) {
    if (e.message.includes('Unauthorized') || e.message.includes('401')) {
      const refreshed = await refreshSecret()
      if (!refreshed) { state.error = 'Unauthorized'; state.connected = false; return }
      try {
        const vRes = await httpGet('/api/version', 3000)
        serverVersion = vRes.version
        serverTime = vRes.serverTime || null
      } catch (_) {}
    } else {
      state.error = e.message
      state.connected = false
    }
  }

  // Step 1: Push pending local changes to server
  const pending = db.dbAll("SELECT * FROM sync_queue WHERE synced = 0 ORDER BY id")

  for (const entry of pending) {
    try {
      const payload = JSON.parse(entry.payload)

      if (entry.table_name === 'transactions') {
        // Fetch full transaction with items and payments
        const txn = db.dbGet("SELECT * FROM transactions WHERE id = ?1", [entry.record_id])
        if (!txn) { markSynced(entry.id); continue }

        const items = db.dbAll("SELECT * FROM transaction_items WHERE transaction_id = ?1", [entry.record_id])
        const payments = db.dbAll("SELECT * FROM payments WHERE transaction_id = ?1", [entry.record_id])

        await httpPost('/api/transactions', { ...txn, items, payments })
      } else if (entry.table_name === 'cash_drawer') {
        await httpPost('/api/cash_drawer', payload)
      } else {
        await httpPost('/api/master-data', {
          table_name: entry.table_name,
          record_id: entry.record_id,
          action: entry.action,
          payload
        })
      }

      markSynced(entry.id)
    } catch (e) {
      // Server unreachable — skip, retry next cycle
      console.error(`LAN push failed for ${entry.table_name}:${entry.record_id}:`, e.message)
      state.error = e.message
      state.connected = false
      return // Stop pushing, will retry next cycle
    }
  }

  if (pending.length > 0) {
    state.lastPush = new Date().toISOString()
  }

  // Step 1b: Push local deletions to server so they propagate
  try {
    const deletedRecords = db.dbAll("SELECT table_name, record_id FROM deleted_records")
    if (deletedRecords.length > 0) {
      await httpPost('/api/deleted', deletedRecords)
    }
  } catch (_) {}

  // Step 2: Pull master data updates from server (skip if version unchanged)
  if (serverVersion !== null && serverVersion === lastKnownVersion && pending.length === 0) {
    return // Nothing changed on server, nothing to push — skip expensive pull
  }

  const lastPull = db.dbGet("SELECT value FROM settings WHERE key = 'lan_last_pull'")?.value || '1970-01-01T00:00:00'

  try {
    const [products, categories, specials, deals, staff, keyboard, dealProducts, settings, kbPages] = await Promise.all([
      httpGet(`/api/products?since=${encodeURIComponent(lastPull)}`),
      httpGet(`/api/categories?since=${encodeURIComponent(lastPull)}`),
      httpGet(`/api/specials?since=${encodeURIComponent(lastPull)}`),
      httpGet(`/api/deals?since=${encodeURIComponent(lastPull)}`),
      httpGet(`/api/staff?since=${encodeURIComponent(lastPull)}`),
      httpGet('/api/keyboard'),
      httpGet('/api/deal_products'),
      httpGet('/api/settings'),
      httpGet('/api/keyboard_pages').catch(() => [])
    ])

    for (const c of categories) {
      db.dbRun(`INSERT OR REPLACE INTO categories (id, name, sort_order, colour, family, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
               [c.id, c.name, c.sort_order || 0, c.colour || '#4fbd77', c.family || '', c.active ?? 1, c.updated_at || null])
    }

    for (const p of products) {
      db.dbRun(`INSERT OR REPLACE INTO products (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, open_price, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
               [p.id, p.barcode || null, p.plu || null, p.name, p.category_id || null,
                p.price, p.cost_price || null, p.unit || 'each', p.tax_rate ?? 0.10,
                p.track_stock || 0, p.stock_qty || 0, p.active ?? 1, p.image_url || null,
                p.open_price ? 1 : 0, p.updated_at || null])
    }

    for (const s of specials) {
      db.dbRun(`INSERT OR REPLACE INTO specials (id, product_id, special_price, start_date, end_date, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
               [s.id, s.product_id, s.special_price, s.start_date || null, s.end_date || null, s.active ?? 1, s.updated_at || null])
    }

    for (const d of deals) {
      db.dbRun(`INSERT OR REPLACE INTO deals (id, name, type, config, start_date, end_date, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
               [d.id, d.name, d.type, d.config, d.start_date || null, d.end_date || null, d.active ?? 1, d.updated_at || null])
    }

    for (const s of staff) {
      db.dbRun(`INSERT OR REPLACE INTO staff (id, name, pin, role, active, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
               [s.id, s.name, s.pin, s.role || 'cashier', s.active ?? 1, s.updated_at || null])
    }

    // Keyboard buttons (full replace — server already filters deletions)
    if (keyboard && keyboard.length > 0) {
      db.dbRun("DELETE FROM keyboard_buttons")
      for (const b of keyboard) {
        db.dbRun(`INSERT OR REPLACE INTO keyboard_buttons (id, label, type, price, image, image_scale, color, bg_color, parent_id, category_filter, alpha_range, sort_order, position, page, grid_row, grid_col, col_span, row_span, product_id, active, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`,
                 [b.id, b.label, b.type, b.price || null, b.image || null, Number(b.image_scale || 100) || 100, b.color || '#fff',
                  b.bg_color || '#1a3d2a', b.parent_id || null, b.category_filter || null,
                  b.alpha_range || null, b.sort_order || 0, b.position || 'grid',
                  b.page || 1, b.grid_row || 0, b.grid_col || 0, b.col_span || 1, b.row_span || 1,
                  b.product_id || null, b.active ?? 1, b.updated_at || null])
      }
    }

    // Deal products (full replace from server)
    if (dealProducts && dealProducts.length > 0) {
      db.dbRun("DELETE FROM deal_products")
      for (const dp of dealProducts) {
        db.dbRun("INSERT OR IGNORE INTO deal_products (deal_id, product_id, role) VALUES (?1, ?2, ?3)",
                 [dp.deal_id, dp.product_id, dp.role || 'trigger'])
      }
    }

    // Settings (respect localOnly)
    if (settings && typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        if (!isLocalOnlySetting(key)) {
          db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [key, value])
        }
      }
    }

    // Keyboard pages
    if (kbPages && kbPages.length > 0) {
      db.dbRun("DELETE FROM keyboard_pages")
      for (const pg of kbPages) {
        db.dbRun(`INSERT OR REPLACE INTO keyboard_pages (page, name, cols, rows)
                  VALUES (?1, ?2, ?3, ?4)`,
                 [pg.page, pg.name || ('Page ' + pg.page), pg.cols || 10, pg.rows || 7])
      }
    }

    state.lastPull = serverTime || new Date().toISOString()
    db.dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('lan_last_pull', ?1)", [state.lastPull])
    db.saveDB()

    if (serverVersion !== null) lastKnownVersion = serverVersion
    state.connected = true
    state.error = null

    if (_dataChangedCallback) _dataChangedCallback()
  } catch (e) {
    // If 401, try refreshing secret and do a full sync instead
    if (e.message.includes('Unauthorized') || e.message.includes('401')) {
      console.log('LAN sync: 401 Unauthorized — refreshing secret...')
      const refreshed = await refreshSecret()
      if (refreshed) {
        try {
          await doFullSync()
          return
        } catch (e2) {
          state.error = e2.message
          state.connected = false
          return
        }
      }
    }
    state.error = e.message
    state.connected = false
  }
}

function markSynced (queueId) {
  db.dbRun("UPDATE sync_queue SET synced = 1 WHERE id = ?1", [queueId])
  db.saveDB()
}

// ─── HTTP Client Helpers ─────────────────────────────────────────────────────

function getRegisterId () {
  if (db) {
    const row = db.dbGet("SELECT value FROM settings WHERE key = 'register_id'")
    return row?.value || 'LANE01'
  }
  return 'LANE01'
}

function httpGet (path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: state.serverIp,
      port: state.port,
      path,
      method: 'GET',
      headers: { 'X-POS-Secret': state.secret || '', 'X-Register-Id': getRegisterId() },
      timeout: timeoutMs || 15000
    }
    const req = http.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (res.statusCode === 200) resolve(data)
          else reject(new Error(data.error || `HTTP ${res.statusCode}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')) })
    req.end()
  })
}

function httpPost (path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const opts = {
      hostname: state.serverIp,
      port: state.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-POS-Secret': state.secret || '',
        'X-Register-Id': getRegisterId()
      },
      timeout: 15000
    }
    const req = http.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString())
          if (res.statusCode === 200) resolve(result)
          else reject(new Error(result.error || `HTTP ${res.statusCode}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')) })
    req.write(data)
    req.end()
  })
}

async function sessionAction (action, staffId, staffName, registerId) {
  if (state.mode === 'server') {
    if (action === 'login') {
      const existing = state.activeSessions[staffId]
      if (existing && existing.registerId !== registerId) {
        return { allowed: false, error: `${staffName || 'This user'} is already logged in on ${existing.registerId}` }
      }
      state.activeSessions[staffId] = { registerId, staffName: staffName || '', loginTime: new Date().toISOString() }
      return { allowed: true }
    }
    if (action === 'logout') { delete state.activeSessions[staffId]; return { ok: true } }
    if (action === 'logout_register') {
      for (const [sid, sess] of Object.entries(state.activeSessions)) {
        if (sess.registerId === registerId) delete state.activeSessions[sid]
      }
      return { ok: true }
    }
  }
  if (state.mode === 'client' && state.serverIp) {
    try {
      return await new Promise((resolve, reject) => {
        const data = JSON.stringify({ action, staffId, staffName, registerId })
        const opts = {
          hostname: state.serverIp, port: state.port || 5555,
          path: '/api/session', method: 'POST', timeout: 3000,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-POS-Secret': state.secret || '' }
        }
        const req = http.request(opts, res => {
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch (e) { reject(e) } })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
        req.write(data)
        req.end()
      })
    } catch (_) { return { allowed: true } }
  }
  return { allowed: true }
}

async function getPeers () {
  if (state.mode === 'server') {
    const regRow = db?.dbGet?.("SELECT value FROM settings WHERE key = 'register_id'")
    const serverName = regRow?.value || 'Server'
    return [
      { registerId: serverName, ip: state.serverIp || getLocalIp(), role: 'server', lastSeen: new Date().toISOString() },
      ...state.clients.map(c => ({ registerId: c.registerId || 'Register', ip: c.ip, role: 'client', lastSeen: c.lastSeen }))
    ]
  }
  if (state.mode === 'client' && state.serverIp) {
    try {
      return await new Promise((resolve, reject) => {
        const opts = {
          hostname: state.serverIp, port: state.port || 5555,
          path: '/api/peers', method: 'GET', timeout: 3000,
          headers: { 'X-POS-Secret': state.secret || '' }
        }
        const req = http.request(opts, res => {
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch (e) { reject(e) } })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
        req.end()
      })
    } catch (_) { return [] }
  }
  return []
}

async function testConnection (ip, port) {
  try {
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: ip,
        port,
        path: '/api/heartbeat',
        method: 'GET',
        timeout: 5000
      }
      const req = http.request(opts, res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')) })
      req.end()
    })
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ─── Auto-Discovery ─────────────────────────────────────────────────────

function discoverServer (timeoutMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false
    const done = (result) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      try { socket?.close() } catch (_) {}
      resolve(result)
    }

    const timer = setTimeout(() => done(null), timeoutMs)

    // Method 1: UDP broadcast listener (fast if server is broadcasting)
    let socket
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.bind(UDP_PORT, () => { socket.setBroadcast(true) })
      socket.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString())
          if (data.service === 'crisp-pos' && data.ip && data.port) {
            done(data)
          }
        } catch (_) {}
      })
      socket.on('error', () => {})
    } catch (_) {}

    // Method 2: Active network scan (probes all IPs on local subnet)
    scanSubnet(5555).then(result => {
      if (result) done(result)
    }).catch(() => {})
  })
}

function scanSubnet (port) {
  return new Promise((resolve) => {
    const localIp = getLocalIp()
    const parts = localIp.split('.')
    if (parts.length !== 4) { resolve(null); return }

    const subnet = parts.slice(0, 3).join('.')
    let found = false
    let pending = 0

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`
      if (ip === localIp) continue

      pending++
      const req = http.request({
        hostname: ip, port, path: '/api/heartbeat',
        method: 'GET', timeout: 1500
      }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          pending--
          if (found) return
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            if (data.ok && res.statusCode === 200) {
              found = true
              resolve({ service: 'crisp-pos', ip, port, secret: data.secret || null })
            }
          } catch (_) {}
          if (pending <= 0 && !found) resolve(null)
        })
      })
      req.on('error', () => { pending--; if (pending <= 0 && !found) resolve(null) })
      req.on('timeout', () => { req.destroy(); pending--; if (pending <= 0 && !found) resolve(null) })
      req.end()
    }
  })
}

// ─── Network Diagnostic Probe ────────────────────────────────────────────────

async function networkDiagnostic () {
  const net = require('net')
  const results = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    interfaces: [],
    lanServerStatus: { ...state },
    portCheck: { port: state.port || 5555, available: null, inUse: null, error: null },
    udpBroadcast: { working: null, error: null },
    discoveredServers: [],
    subnetScan: { scanned: 0, reachable: [], error: null },
    firewallHints: [],
    dns: { hostname: null, error: null },
    recommendations: []
  }

  // 1. Enumerate all network interfaces
  const nets = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs) {
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4
      results.interfaces.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        mac: addr.mac,
        internal: addr.internal,
        family: isIPv4 ? 'IPv4' : 'IPv6',
        cidr: addr.cidr || null
      })
    }
  }

  const externalIPv4 = results.interfaces.filter(i => i.family === 'IPv4' && !i.internal)
  if (externalIPv4.length === 0) {
    results.recommendations.push('No external IPv4 network interfaces found. Check that this PC is connected to the local network (WiFi or Ethernet).')
  } else if (externalIPv4.length > 1) {
    results.recommendations.push(`Multiple network adapters detected (${externalIPv4.map(i => i.name + ':' + i.address).join(', ')}). The server binds on 0.0.0.0 (all interfaces), but clients may need to know which IP to use.`)
  }

  // Check for common problematic ranges
  for (const iface of externalIPv4) {
    if (iface.address.startsWith('169.254.')) {
      results.recommendations.push(`${iface.name} (${iface.address}) has a link-local address (169.254.x.x) — this means DHCP failed. Check router/network cable.`)
    }
    if (iface.address.startsWith('10.') || iface.address.startsWith('172.') || iface.address.startsWith('192.168.')) {
      // Good — private range
    } else {
      results.recommendations.push(`${iface.name} (${iface.address}) has a public IP. LAN sync works best on private networks (192.168.x.x, 10.x.x.x).`)
    }
  }

  // 2. Check if LAN port is available / in use
  const port = state.port || 5555
  try {
    const portFree = await checkPort(port)
    results.portCheck.available = portFree
    results.portCheck.inUse = !portFree
    if (!portFree && state.mode !== 'server') {
      results.recommendations.push(`Port ${port} is already in use. Another instance of the app or another program may be using it.`)
    }
  } catch (e) {
    results.portCheck.error = e.message
  }

  // 3. Test UDP broadcast
  try {
    results.udpBroadcast = await testUdpBroadcast()
    if (!results.udpBroadcast.working) {
      results.recommendations.push('UDP broadcast failed. This prevents automatic server discovery. Possible causes: firewall blocking UDP port 5556, or network doesn\'t support broadcast (some corporate networks block it).')
    }
  } catch (e) {
    results.udpBroadcast = { working: false, error: e.message }
  }

  // 4. UDP discovery — listen for server broadcasts
  try {
    results.discoveredServers = await listenForBroadcasts(3000)
    if (results.discoveredServers.length > 0) {
      results.recommendations.push(`Found ${results.discoveredServers.length} server(s) broadcasting on the network.`)
    }
  } catch (_) {}

  // 5. Subnet scan — find other POS instances
  const primaryIp = getLocalIp()
  if (primaryIp !== '127.0.0.1') {
    try {
      const scanResults = await thoroughSubnetScan(primaryIp, port)
      results.subnetScan = scanResults
      if (scanResults.reachable.length === 0 && state.mode === 'client') {
        results.recommendations.push('No POS servers found on the local subnet. Make sure the server PC has the app running and is on the same network.')
      }
    } catch (e) {
      results.subnetScan.error = e.message
    }
  } else {
    results.subnetScan.error = 'Could not determine local IP address'
    results.recommendations.push('Local IP resolves to 127.0.0.1. No external network detected.')
  }

  // 6. Platform-specific firewall hints
  if (os.platform() === 'win32') {
    results.firewallHints.push(
      'Windows Firewall may block incoming connections on port ' + port + '.',
      'To allow: Settings > Windows Security > Firewall > Allow an app through firewall > Add Electron.',
      'Or run in admin PowerShell: netsh advfirewall firewall add rule name="YieldPOS" dir=in action=allow protocol=TCP localport=' + port,
      'Also add UDP rule: netsh advfirewall firewall add rule name="YieldPOS-UDP" dir=in action=allow protocol=UDP localport=5556'
    )
    // Try to check firewall status
    try {
      const { execSync } = require('child_process')
      const fwStatus = execSync('netsh advfirewall show allprofiles state', { timeout: 5000, encoding: 'utf-8' })
      const profiles = fwStatus.match(/Profile.*\n.*State\s+(\w+)/gi) || []
      const activeProfiles = profiles.filter(p => p.toLowerCase().includes('on'))
      if (activeProfiles.length > 0) {
        results.firewallHints.unshift(`Windows Firewall is ON for ${activeProfiles.length} profile(s). This is likely blocking LAN connections.`)
        results.recommendations.push('Windows Firewall is active. You need to add firewall rules for TCP port ' + port + ' and UDP port 5556.')
      }
    } catch (_) {
      results.firewallHints.push('Could not check firewall status (needs admin privileges).')
    }

    // Check if our port has a firewall rule
    try {
      const { execSync } = require('child_process')
      const rules = execSync(`netsh advfirewall firewall show rule name=all dir=in | findstr /i "${port}"`, { timeout: 5000, encoding: 'utf-8' })
      if (rules.trim()) {
        results.firewallHints.push('Found existing firewall rule(s) mentioning port ' + port + '.')
      } else {
        results.firewallHints.push('No firewall rule found for port ' + port + '. Connections will be blocked.')
      }
    } catch (_) {
      results.firewallHints.push('No inbound firewall rule found for port ' + port + '.')
    }
  } else if (os.platform() === 'darwin') {
    results.firewallHints.push(
      'macOS Application Firewall: System Settings > Network > Firewall. If enabled, allow Electron/YieldPOS.',
      'macOS usually prompts "Allow incoming connections?" on first server start — click Allow.'
    )
  }

  // 7. Connectivity self-test: can we reach our own server?
  if (state.mode === 'server' && state.connected) {
    try {
      const selfTest = await testConnection(primaryIp, port)
      if (selfTest.ok) {
        results.recommendations.push('Self-test passed: this server is reachable at ' + primaryIp + ':' + port)
      } else {
        results.recommendations.push('Self-test FAILED: server is running but cannot connect to itself at ' + primaryIp + ':' + port + '. Firewall is likely blocking it.')
      }
    } catch (_) {}
  }

  // 8. DNS / hostname resolution
  try {
    const { execSync } = require('child_process')
    const hostname = os.hostname()
    results.dns.hostname = hostname
  } catch (e) {
    results.dns.error = e.message
  }

  // Final summary recommendations
  if (results.recommendations.length === 0) {
    results.recommendations.push('Network looks healthy. All checks passed.')
  }

  return results
}

function checkPort (port) {
  return new Promise((resolve) => {
    const net = require('net')
    const tester = net.createServer()
    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(false)
      else resolve(false)
    })
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port, '0.0.0.0')
  })
}

function testUdpBroadcast () {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { sender?.close() } catch (_) {}
      try { receiver?.close() } catch (_) {}
      resolve({ working: false, error: 'Timeout — no broadcast received within 2s' })
    }, 2000)

    let sender, receiver
    const testPort = 5557 // Temporary test port
    const testMsg = 'crisp-pos-udp-test-' + Date.now()

    try {
      receiver = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      receiver.bind(testPort, () => {
        receiver.setBroadcast(true)
      })
      receiver.on('message', (msg) => {
        if (msg.toString() === testMsg) {
          clearTimeout(timeout)
          try { sender?.close() } catch (_) {}
          try { receiver?.close() } catch (_) {}
          resolve({ working: true, error: null })
        }
      })
      receiver.on('error', (e) => {
        clearTimeout(timeout)
        try { sender?.close() } catch (_) {}
        resolve({ working: false, error: 'Receiver error: ' + e.message })
      })

      sender = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sender.bind(() => {
        sender.setBroadcast(true)
        const buf = Buffer.from(testMsg)
        sender.send(buf, 0, buf.length, testPort, '255.255.255.255', (err) => {
          if (err) {
            clearTimeout(timeout)
            try { sender?.close() } catch (_) {}
            try { receiver?.close() } catch (_) {}
            resolve({ working: false, error: 'Send failed: ' + err.message })
          }
        })
      })
      sender.on('error', (e) => {
        clearTimeout(timeout)
        try { receiver?.close() } catch (_) {}
        resolve({ working: false, error: 'Sender error: ' + e.message })
      })
    } catch (e) {
      clearTimeout(timeout)
      resolve({ working: false, error: e.message })
    }
  })
}

function listenForBroadcasts (timeoutMs) {
  return new Promise((resolve) => {
    const servers = []
    const seen = new Set()
    let socket

    const timer = setTimeout(() => {
      try { socket?.close() } catch (_) {}
      resolve(servers)
    }, timeoutMs)

    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.bind(UDP_PORT, () => { socket.setBroadcast(true) })
      socket.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString())
          if (data.service === 'crisp-pos' && data.ip && !seen.has(data.ip)) {
            seen.add(data.ip)
            servers.push({ ip: data.ip, port: data.port, registerId: data.register_id || 'unknown' })
          }
        } catch (_) {}
      })
      socket.on('error', () => {
        clearTimeout(timer)
        resolve(servers)
      })
    } catch (_) {
      clearTimeout(timer)
      resolve(servers)
    }
  })
}

async function thoroughSubnetScan (localIp, port) {
  const result = { scanned: 0, reachable: [], error: null }
  const parts = localIp.split('.')
  if (parts.length !== 4) { result.error = 'Invalid IP format'; return result }

  const subnet = parts.slice(0, 3).join('.')
  const promises = []

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`
    result.scanned++
    promises.push(
      quickTcpCheck(ip, port, 1200).then(reachable => {
        if (reachable) {
          return testConnection(ip, port).then(hb => {
            result.reachable.push({
              ip,
              port,
              isPosServer: hb.ok === true,
              registerId: hb.register_id || null,
              secret: hb.secret ? '***' : null,
              responseTime: hb.time || null
            })
          }).catch(() => {
            result.reachable.push({ ip, port, isPosServer: false, error: 'Port open but not POS' })
          })
        }
      }).catch(() => {})
    )
  }

  await Promise.all(promises)
  return result
}

function quickTcpCheck (ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const net = require('net')
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.connect(port, ip)
  })
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function stopAll () {
  if (server) { server.close(); server = null }
  if (udpSocket) { try { udpSocket.close() } catch (_) {}; udpSocket = null }
  if (udpBroadcastTimer) { clearInterval(udpBroadcastTimer); udpBroadcastTimer = null }
  if (clientSyncTimer) { clearInterval(clientSyncTimer); clientSyncTimer = null }
  state.connected = false
  state.mode = 'off'
  state.error = null
  state.clients = []
}
