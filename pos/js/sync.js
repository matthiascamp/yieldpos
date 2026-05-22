const SUPABASE_URL = ''
const SUPABASE_ANON_KEY = ''

let supabase = null

export async function initSync(url, key) {
  if (!url || !key) return false

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
  supabase = createClient(url, key)
  return true
}

export function isOnline() {
  return !!supabase && navigator.onLine
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

// ─── Push: transactions + items + payments to Supabase ──────────────────────

export async function pushPending() {
  if (!isOnline()) return { pushed: 0 }

  const pending = await window.pos.getSyncPending()
  if (!pending.length) return { pushed: 0 }

  const synced = []

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload)
      const table = item.table_name

      if (table === 'transactions') {
        // Push the transaction itself
        const { error: txnErr } = await supabase.from('transactions').upsert(payload)
        if (txnErr) throw txnErr

        // Push associated items and payments
        const items = await window.pos.getTransactionItems(item.record_id)
        if (items && items.length) {
          const { error: itemErr } = await supabase.from('transaction_items').upsert(items)
          if (itemErr) console.warn('Push items failed:', itemErr.message)
        }

        const payments = await window.pos.getTransactionPayments(item.record_id)
        if (payments && payments.length) {
          const { error: payErr } = await supabase.from('payments').upsert(payments)
          if (payErr) console.warn('Push payments failed:', payErr.message)
        }
      } else if (table === 'settings') {
        if (isLocalOnlySetting(item.record_id || payload.key)) {
          synced.push(item.id)
          continue
        }
        // Settings use 'key' as PK, not 'id'
        if (item.action === 'delete') {
          const { error } = await supabase.from(table).delete().eq('key', item.record_id)
          if (error) throw error
        } else {
          const { error } = await supabase.from(table).upsert({ ...payload, updated_at: new Date().toISOString() })
          if (error) throw error
        }
      } else if (table === 'keyboard_pages' && item.action === 'delete') {
        const { error } = await supabase.from(table).delete().eq('page', Number(item.record_id))
        if (error) throw error
      } else if (table === 'deal_products' && item.action === 'delete') {
        const dealId = payload.deal_id || String(item.record_id).split(':')[0]
        const productId = payload.product_id || String(item.record_id).split(':')[1]
        const { error } = await supabase.from(table).delete().eq('deal_id', dealId).eq('product_id', productId)
        if (error) throw error
      } else if (item.action === 'insert' || item.action === 'update') {
        let cleanPayload = { ...payload }
        // Strip fields that don't exist in Supabase schema
        if (table === 'staff') {
          cleanPayload.pin_hash = cleanPayload.pin_hash || cleanPayload.pin || ''
          delete cleanPayload.pin
        }
        const { error } = await supabase.from(table).upsert(cleanPayload)
        if (error) throw error
      } else if (item.action === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', item.record_id)
        if (error) throw error
      }

      synced.push(item.id)
    } catch (err) {
      console.error(`Sync failed for ${item.table_name}/${item.record_id}:`, err.message)
    }
  }

  if (synced.length) {
    await window.pos.markSynced(synced)
  }

  return { pushed: synced.length, failed: pending.length - synced.length }
}

// ─── Pull: delta sync using updated_at timestamps ──────────────────────────

async function getLastPull() {
  return (await window.pos.getSetting('supabase_last_pull')) || '1970-01-01T00:00:00.000Z'
}

async function setLastPull(ts) {
  await window.pos.setSetting('supabase_last_pull', ts)
}

export async function pullProducts(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  // Fetch products updated since last pull (paginate in chunks of 1000)
  let allProducts = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gte('updated_at', lastPull)
      .range(from, from + pageSize - 1)
    if (error) { console.error('Pull products failed:', error.message); return false }
    if (!data || !data.length) break
    allProducts = allProducts.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  if (allProducts.length) {
    await window.pos.bulkUpsertProducts(allProducts)
  }
  return allProducts.length
}

export async function pullCategories(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  const { data: cats, error } = await supabase
    .from('categories')
    .select('*')
    .gte('updated_at', lastPull)

  if (error) return false

  if (cats && cats.length) {
    await window.pos.bulkUpsertCategories(cats)
  }
  return cats ? cats.length : 0
}

export async function pullKeyboard(since) {
  if (!isOnline()) return false

  // Always pull all keyboard buttons (small dataset, ensures layout is always correct)
  const { data, error } = await supabase
    .from('keyboard_buttons')
    .select('*')

  if (error) { console.error('Pull keyboard failed:', error.message); return false }

  if (data && data.length) {
    // Don't re-insert records that were intentionally deleted locally
    const deletedRows = await window.pos.getDeletedRecords('keyboard_buttons')
    const deletedIds = new Set(deletedRows.map(r => r.record_id))
    const filtered = data.filter(d => !deletedIds.has(d.id))
    if (filtered.length) await window.pos.bulkUpsertKeyboard(filtered)
  }
  return data ? data.length : 0
}

export async function pullKeyboardPages() {
  if (!isOnline()) return false

  const { data, error } = await supabase
    .from('keyboard_pages')
    .select('*')

  if (error) { console.error('Pull keyboard_pages failed:', error.message); return false }

  if (data && data.length && window.pos.bulkUpsertKeyboardPages) {
    await window.pos.bulkUpsertKeyboardPages(data)
  }
  return data ? data.length : 0
}

export async function pullSettings() {
  if (!isOnline()) return false

  const { data, error } = await supabase
    .from('settings')
    .select('*')

  if (error) { console.error('Pull settings failed:', error.message); return false }

  if (data && data.length) {
    // Don't overwrite settings that have pending local changes
    const pending = await window.pos.getSyncPending()
    const pendingKeys = new Set(
      pending.filter(p => p.table_name === 'settings').map(p => p.record_id)
    )
    const deletedRows = await window.pos.getDeletedRecords('settings')
    const deletedKeys = new Set(deletedRows.map(r => r.record_id))
    const filtered = data.filter(d => !isLocalOnlySetting(d.key) && !pendingKeys.has(d.key) && !deletedKeys.has(d.key))
    if (filtered.length) await window.pos.bulkUpsertSettings(filtered)
  }
  return data ? data.length : 0
}

export async function pullStaff(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .gte('updated_at', lastPull)

  if (error) { console.error('Pull staff failed:', error.message); return false }

  if (data && data.length) {
    await window.pos.bulkUpsertStaff(data)
  }
  return data ? data.length : 0
}

export async function pullDeals(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .gte('updated_at', lastPull)

  if (error) { console.error('Pull deals failed:', error.message); return false }

  if (data && data.length) {
    // Convert JSONB config to string for SQLite storage
    const mapped = data.map(d => ({
      ...d,
      config: typeof d.config === 'object' ? JSON.stringify(d.config) : d.config
    }))
    await window.pos.bulkUpsertDeals(mapped)
  }
  return data ? data.length : 0
}

export async function pullDealProducts() {
  if (!isOnline()) return false

  // deal_products has no updated_at, pull all
  const { data, error } = await supabase
    .from('deal_products')
    .select('*')

  if (error) { console.error('Pull deal_products failed:', error.message); return false }

  if (data && data.length) {
    await window.pos.bulkUpsertDealProducts(data)
  }
  return data ? data.length : 0
}

export async function pullSpecials(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  const { data, error } = await supabase
    .from('specials')
    .select('*')
    .gte('updated_at', lastPull)

  if (error) { console.error('Pull specials failed:', error.message); return false }

  if (data && data.length) {
    await window.pos.bulkUpsertSpecials(data)
  }
  return data ? data.length : 0
}

export async function pullCashDrawer(since) {
  if (!isOnline()) return false

  const lastPull = since || await getLastPull()

  const { data, error } = await supabase
    .from('cash_drawer')
    .select('*')
    .gte('created_at', lastPull)

  if (error) { console.error('Pull cash_drawer failed:', error.message); return false }

  if (data && data.length) {
    await window.pos.bulkUpsertCashDrawer(data)
  }
  return data ? data.length : 0
}

export async function pushSettings() {
  if (!isOnline()) return false

  const settings = await window.pos.getAllSettings()
  if (!settings || !Object.keys(settings).length) return 0

  const payload = Object.entries(settings)
    .filter(([key]) => !isLocalOnlySetting(key))
    .map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString()
    }))
  if (!payload.length) return 0

  const { error } = await supabase.from('settings').upsert(payload)
  if (error) { console.error('Push settings failed:', error.message); return false }
  return payload.length
}

export async function pushKeyboard() {
  if (!isOnline()) return false

  const buttons = await window.pos.getAllButtons()
  if (!buttons || !buttons.length) return 0

  // Push all keyboard buttons to Supabase (full replace)
  const payload = buttons.map(b => ({
    id: b.id,
    label: b.label,
    type: b.type,
    price: b.price || 0,
    image: b.image || null,
    image_scale: Number(b.image_scale || 100) || 100,
    color: b.color || '#fff',
    bg_color: b.bg_color || '#1a3d2a',
    parent_id: b.parent_id || null,
    category_filter: b.category_filter || null,
    alpha_range: b.alpha_range || null,
    sort_order: b.sort_order || 0,
    position: b.position || 'grid',
    page: b.page || 1,
    grid_row: b.grid_row || 0,
    grid_col: b.grid_col || 0,
    col_span: b.col_span || 1,
    row_span: b.row_span || 1,
    product_id: b.product_id || null,
    active: b.active !== 0,
    updated_at: new Date().toISOString()
  }))

  const { error } = await supabase.from('keyboard_buttons').upsert(payload)
  if (error) { console.error('Push keyboard failed:', error.message); return false }
  return payload.length
}

export async function pushKeyboardPages() {
  if (!isOnline()) return false

  const pages = await window.pos.getPages()
  if (!pages || !pages.length) return 0

  const payload = pages.map(pg => ({
    page: pg.page,
    name: pg.name || ('Page ' + pg.page),
    cols: pg.cols || 13,
    rows: pg.rows || 7,
    updated_at: new Date().toISOString()
  }))

  const { error } = await supabase.from('keyboard_pages').upsert(payload)
  if (error) { console.error('Push keyboard_pages failed:', error.message); return false }
  return payload.length
}

export async function pullAll() {
  if (!isOnline()) return { categories: 0, products: 0, keyboard: 0, keyboard_pages: 0, settings: 0, staff: 0, deals: 0, deal_products: 0, specials: 0, cash_drawer: 0 }

  // Push local deletes/changes first so they take priority over incoming data
  await pushPending()

  const since = await getLastPull()
  const pullTime = new Date().toISOString()

  const catCount = await pullCategories(since)
  const prodCount = await pullProducts(since)
  const kbCount = await pullKeyboard(since)
  const kbPageCount = await pullKeyboardPages()
  const settingsCount = await pullSettings()
  const staffCount = await pullStaff(since)
  const dealsCount = await pullDeals(since)
  const dealProductsCount = await pullDealProducts()
  const specialsCount = await pullSpecials(since)
  const cashDrawerCount = await pullCashDrawer(since)

  // Only update timestamp if pull succeeded
  if (catCount !== false && prodCount !== false) {
    await setLastPull(pullTime)
  }

  return { categories: catCount || 0, products: prodCount || 0, keyboard: kbCount || 0, keyboard_pages: kbPageCount || 0, settings: settingsCount || 0, staff: staffCount || 0, deals: dealsCount || 0, deal_products: dealProductsCount || 0, specials: specialsCount || 0, cash_drawer: cashDrawerCount || 0 }
}

// First-time full pull (ignores last_pull timestamp)
export async function pullFull() {
  if (!isOnline()) return { categories: 0, products: 0, keyboard: 0, keyboard_pages: 0, settings: 0, staff: 0, deals: 0, deal_products: 0, specials: 0, cash_drawer: 0 }

  const epoch = '1970-01-01T00:00:00.000Z'
  const pullTime = new Date().toISOString()
  const catCount = await pullCategories(epoch)
  const prodCount = await pullProducts(epoch)
  const kbCount = await pullKeyboard(epoch)
  const kbPageCount = await pullKeyboardPages()
  const settingsCount = await pullSettings()
  const staffCount = await pullStaff(epoch)
  const dealsCount = await pullDeals(epoch)
  const dealProductsCount = await pullDealProducts()
  const specialsCount = await pullSpecials(epoch)
  const cashDrawerCount = await pullCashDrawer(epoch)

  if (catCount !== false && prodCount !== false) {
    await setLastPull(pullTime)
  }

  return { categories: catCount || 0, products: prodCount || 0, keyboard: kbCount || 0, keyboard_pages: kbPageCount || 0, settings: settingsCount || 0, staff: staffCount || 0, deals: dealsCount || 0, deal_products: dealProductsCount || 0, specials: specialsCount || 0, cash_drawer: cashDrawerCount || 0 }
}

// ─── Realtime subscriptions ─────────────────────────────────────────────────

let realtimeChannel = null

export function subscribeToChanges(onProductChange) {
  if (!isOnline()) return

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  realtimeChannel = supabase
    .channel('pos-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        window.pos.deleteProduct(payload.old.id)
      } else if (payload.new) {
        window.pos.upsertProduct(payload.new)
      }
      if (onProductChange) onProductChange(payload.new || payload.old)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
      if (payload.new) {
        window.pos.upsertCategory(payload.new)
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'specials' }, (payload) => {
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        window.pos.deleteSpecial(payload.old.id)
      } else if (payload.new) {
        window.pos.bulkUpsertSpecials([payload.new])
      }
      if (onProductChange) onProductChange()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keyboard_buttons' }, (payload) => {
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        window.pos.deleteButton(payload.old.id)
      } else if (payload.new) {
        window.pos.upsertButton(payload.new)
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keyboard_pages' }, (payload) => {
      if (payload.new && window.pos.bulkUpsertKeyboardPages) {
        window.pos.bulkUpsertKeyboardPages([payload.new])
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, (payload) => {
      if (payload.new) {
        window.pos.bulkUpsertStaff([payload.new])
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, (payload) => {
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        window.pos.deleteDeal(payload.old.id)
      } else if (payload.new) {
        const deal = { ...payload.new, config: typeof payload.new.config === 'object' ? JSON.stringify(payload.new.config) : payload.new.config }
        window.pos.bulkUpsertDeals([deal])
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
      if (payload.new) {
        window.pos.setSetting(payload.new.key, payload.new.value)
      }
    })
    .subscribe()
}

// ─── Auto sync loop ─────────────────────────────────────────────────────────

let syncInterval = null

export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) clearInterval(syncInterval)
  syncInterval = setInterval(async () => {
    try {
      // Push pending transactions/changes to Supabase
      await pushPending()
      // Delta pull any product/category updates
      await pullAll()
    } catch (e) {
      console.error('Auto sync error:', e.message)
    }
  }, intervalMs)
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  if (realtimeChannel) {
    supabase?.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}
