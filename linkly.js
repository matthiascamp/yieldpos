// ─── Linkly Cloud Payment Terminal Integration ───────────────────────────────
// Connects to Linkly Cloud REST API for EFTPOS terminal communication.
// Supports: purchase, refund, settlement, pairing, status polling.
// Docs: https://www.linkly.com.au/apidoc/

const https = require('https')
const { v4: genuuid } = require('uuid')

const AUTH_HOSTS = {
  sandbox: 'auth.sandbox.cloud.pceftpos.com',
  production: 'auth.cloud.pceftpos.com'
}
const API_HOSTS = {
  sandbox: 'rest.pos.sandbox.cloud.pceftpos.com',
  production: 'rest.pos.cloud.pceftpos.com'
}

let state = {
  paired: false,
  secret: null,
  token: null,
  tokenExpiry: null,
  environment: 'sandbox',
  username: '',
  password: '',
  posId: null,
  lastTxn: null,
  polling: false
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function request (host, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (data) headers['Content-Length'] = Buffer.byteLength(data)

    const req = https.request({
      hostname: host, port: 443, path, method, headers, timeout: 120000
    }, res => {
      let chunks = ''
      res.on('data', d => { chunks += d })
      res.on('end', () => {
        try {
          const json = chunks ? JSON.parse(chunks) : {}
          if (res.statusCode === 202) { resolve({ _httpStatus: 202, ...json }); return }
          if (res.statusCode >= 400) {
            reject(new Error(json.Message || json.message || json.error || `HTTP ${res.statusCode}`))
          } else {
            resolve(json)
          }
        } catch (e) { reject(new Error(`Invalid response: ${chunks.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    if (data) req.write(data)
    req.end()
  })
}

function authHost () { return AUTH_HOSTS[state.environment] || AUTH_HOSTS.sandbox }
function apiHost () { return API_HOSTS[state.environment] || API_HOSTS.sandbox }

// ─── Authentication & Pairing ────────────────────────────────────────────────

async function pair (username, password, pairCode) {
  state.username = username
  state.password = password

  const result = await request(authHost(), 'POST', '/v1/pairing/cloudpos', {
    username, password, pairCode
  })

  if (result.secret) {
    state.secret = result.secret
    state.paired = true
  }
  return result
}

async function getToken () {
  if (!state.secret) throw new Error('Terminal not paired — pair first')

  const result = await request(authHost(), 'POST', '/v1/tokens/cloudpos', {
    secret: state.secret,
    posName: 'YieldPOS Client',
    posVersion: '1.0.0',
    posId: state.posId || genuuid(),
    posVendorId: 'b8f0e2a0-1234-4abc-9def-567890abcdef'
  })

  if (result.token) {
    state.token = result.token
    const expSec = result.expirySeconds || 86400
    state.tokenExpiry = Date.now() + (expSec - 300) * 1000
  }
  return result
}

let _tokenPromise = null
async function ensureToken () {
  if (!state.token || !state.tokenExpiry || Date.now() > state.tokenExpiry) {
    if (!_tokenPromise) {
      _tokenPromise = getToken().finally(() => { _tokenPromise = null })
    }
    await _tokenPromise
  }
}

// ─── API call helper ─────────────────────────────────────────────────────────

async function apiCall (method, path, body) {
  await ensureToken()
  return request(apiHost(), method, path, body, state.token)
}

// ─── Transactions ────────────────────────────────────────────────────────────

async function purchase (amountCents, txnRef) {
  const sessionId = genuuid()
  const result = await apiCall('POST', `/v1/sessions/${sessionId}/transaction?async=false`, {
    Request: {
      Merchant: '00',
      TxnType: 'P',
      AmtPurchase: Math.round(amountCents),
      TxnRef: (txnRef || `TXN-${Date.now()}`).slice(0, 16),
      CurrencyCode: 'AUD',
      CutReceipt: '0',
      ReceiptAutoPrint: '0',
      Application: '00'
    }
  })

  state.lastTxn = { sessionId, status: 'in_progress', startedAt: Date.now() }

  if (result.Response) {
    return parseTransactionResponse(result, amountCents)
  }
  if (result._httpStatus === 202) {
    return await pollUntilComplete(sessionId, amountCents)
  }
  return result
}

async function refund (amountCents, txnRef, originalRfn) {
  const sessionId = genuuid()
  const pad = {}
  if (originalRfn) pad.RFN = originalRfn

  const result = await apiCall('POST', `/v1/sessions/${sessionId}/transaction?async=false`, {
    Request: {
      Merchant: '00',
      TxnType: 'R',
      AmtPurchase: Math.round(amountCents),
      TxnRef: (txnRef || `REF-${Date.now()}`).slice(0, 16),
      CurrencyCode: 'AUD',
      CutReceipt: '0',
      ReceiptAutoPrint: '0',
      Application: '00',
      PurchaseAnalysisData: pad
    }
  })

  state.lastTxn = { sessionId, status: 'in_progress', startedAt: Date.now() }

  if (result.Response) {
    return parseTransactionResponse(result, amountCents)
  }
  if (result._httpStatus === 202) {
    return await pollUntilComplete(sessionId, amountCents)
  }
  return result
}

function parseTransactionResponse (result, amountCents) {
  const r = result.Response || {}
  const receipt = []
  if (result.Receipt) {
    for (const rcpt of (Array.isArray(result.Receipt) ? result.Receipt : [result.Receipt])) {
      if (rcpt.Response && rcpt.Response.Lines) receipt.push(...rcpt.Response.Lines)
    }
  }

  return {
    success: r.Success === true || r.ResponseCode === '00',
    responseCode: r.ResponseCode,
    responseText: r.ResponseText,
    cardType: r.CardType,
    accountType: r.AccountType,
    bankRef: r.RRN,
    authCode: r.AuthCode,
    pan: r.Pan,
    amount: r.AmtPurchase || amountCents,
    surcharge: r.AmtTip || 0,
    rfn: r.PurchaseAnalysisData?.RFN || null,
    receipt,
    raw: r
  }
}

async function pollTransaction (sessionId) {
  return await apiCall('GET', `/v1/sessions/${sessionId}/transaction`)
}

async function pollUntilComplete (sessionId, amountCents) {
  const TIMEOUT = 120000
  const startTime = Date.now()
  let delay = 1000

  while (Date.now() - startTime < TIMEOUT) {
    await sleep(delay)
    delay = Math.min(delay * 2, 5000)

    try {
      const poll = await pollTransaction(sessionId)
      if (poll.Response) {
        return parseTransactionResponse(poll, amountCents)
      }
    } catch (e) {
      if (e.message.includes('404')) throw new Error('Transaction not found on terminal')
      if (e.message.includes('401')) { state.token = null; await ensureToken() }
    }
  }
  throw new Error('Payment timed out — check terminal')
}

async function settlement () {
  const sessionId = genuuid()
  return await apiCall('POST', `/v1/sessions/${sessionId}/settlement?async=false`, {
    Request: {
      Merchant: '00',
      SettlementType: 'S',
      Application: '00',
      ReceiptAutoPrint: '0',
      CutReceipt: '0'
    }
  })
}

async function sendKey (key) {
  if (!state.lastTxn?.sessionId) return null
  try {
    return await apiCall('POST', `/v1/sessions/${state.lastTxn.sessionId}/sendkey?async=false`, {
      Request: { Key: String(key), Data: '' }
    })
  } catch (_) { return null }
}

async function cancelTransaction () {
  return sendKey('0')
}

async function logon () {
  const sessionId = genuuid()
  return await apiCall('POST', `/v1/sessions/${sessionId}/logon?async=false`, {
    Request: { LogonType: ' ', Merchant: '00' }
  })
}

async function terminalStatus () {
  const sessionId = genuuid()
  return await apiCall('POST', `/v1/sessions/${sessionId}/status?async=false`, {
    Request: { StatusType: '0', Merchant: '00' }
  })
}

// ─── High-level payment flow ─────────────────────────────────────────────────

async function processPayment (amountCents, txnRef, onStatus) {
  if (onStatus) onStatus({ stage: 'waiting', message: 'Present card on terminal...' })
  state.polling = true

  try {
    const result = await purchase(amountCents, txnRef)
    state.polling = false
    state.lastTxn = { ...state.lastTxn, status: result.success ? 'approved' : 'declined', result }
    return result
  } catch (e) {
    state.polling = false
    throw e
  }
}

async function processRefund (amountCents, txnRef, onStatus, originalRfn) {
  if (onStatus) onStatus({ stage: 'waiting', message: 'Present card for refund...' })
  state.polling = true

  try {
    const result = await refund(amountCents, txnRef, originalRfn)
    state.polling = false
    return result
  } catch (e) {
    state.polling = false
    throw e
  }
}

function cancelPolling () {
  state.polling = false
  cancelTransaction()
}

// ─── Status & Config ─────────────────────────────────────────────────────────

function getStatus () {
  return {
    paired: state.paired,
    hasCredentials: !!(state.username && state.secret),
    environment: state.environment,
    posId: state.posId,
    sessionActive: !!(state.token && Date.now() < (state.tokenExpiry || 0)),
    lastTxn: state.lastTxn
  }
}

function configure (opts) {
  if (opts.environment) state.environment = opts.environment
  if (opts.username) state.username = opts.username
  if (opts.password) state.password = opts.password
  if (opts.posId) state.posId = opts.posId
  if (opts.secret) { state.secret = opts.secret; state.paired = true }
}

function reset () {
  state.token = null
  state.tokenExpiry = null
  state.lastTxn = null
  state.polling = false
}

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

module.exports = {
  pair, getToken, purchase, refund, pollTransaction, settlement,
  sendKey, cancelTransaction, cancelPolling, logon, terminalStatus,
  processPayment, processRefund, getStatus, configure, reset
}
