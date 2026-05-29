const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pos', {
  // Products
  searchProducts:     (query)  => ipcRenderer.invoke('db:products:search', query),
  getProducts:        ()       => ipcRenderer.invoke('db:products:getAll'),
  getProductByBarcode:(code)   => ipcRenderer.invoke('db:products:getByBarcode', code),
  getProductById:     (id)     => ipcRenderer.invoke('db:products:getById', id),
  getProductsByCategory:(catId)=> ipcRenderer.invoke('db:products:getByCategory', catId),
  getCategories:      ()       => ipcRenderer.invoke('db:categories:getAll'),
  getNextProductPlu:  ()       => ipcRenderer.invoke('db:products:nextPlu'),
  upsertProduct:      (p)     => ipcRenderer.invoke('db:products:upsert', p),
  upsertCategory:     (c)     => ipcRenderer.invoke('db:categories:upsert', c),
  bulkUpsertProducts: (arr)   => ipcRenderer.invoke('db:products:bulkUpsert', arr),
  bulkUpsertCategories:(arr)  => ipcRenderer.invoke('db:categories:bulkUpsert', arr),
  deleteProduct:      (id)     => ipcRenderer.invoke('db:products:delete', id),

  // Specials
  getSpecials:        ()      => ipcRenderer.invoke('db:specials:getAll'),
  upsertSpecial:      (s)     => ipcRenderer.invoke('db:specials:upsert', s),
  deleteSpecial:      (id)    => ipcRenderer.invoke('db:specials:delete', id),
  bulkUpsertSpecials: (arr)   => ipcRenderer.invoke('db:specials:bulkUpsert', arr),

  // Deals
  getDeals:           ()       => ipcRenderer.invoke('db:deals:getAll'),
  getActiveDeals:     ()       => ipcRenderer.invoke('db:deals:getActive'),
  upsertDeal:         (d)     => ipcRenderer.invoke('db:deals:upsert', d),
  deleteDeal:         (id)     => ipcRenderer.invoke('db:deals:delete', id),
  getDealProducts:    (id)     => ipcRenderer.invoke('db:deals:getProducts', id),
  getAllDealProducts: ()       => ipcRenderer.invoke('db:dealProducts:getAll'),
  setDealProducts:    (id, p)  => ipcRenderer.invoke('db:deals:setProducts', id, p),
  bulkUpsertDeals:    (arr)   => ipcRenderer.invoke('db:deals:bulkUpsert', arr),
  bulkUpsertDealProducts: (arr) => ipcRenderer.invoke('db:dealProducts:bulkUpsert', arr),

  // Transactions
  saveTransaction:    (txn)   => ipcRenderer.invoke('db:transaction:save', txn),
  getTransaction:     (id)    => ipcRenderer.invoke('db:transaction:get', id),
  voidTransaction:    (id)    => ipcRenderer.invoke('db:transaction:void', id),
  refundTransaction:  (id)    => ipcRenderer.invoke('db:transaction:refund', id),
  getParkedSales:     ()      => ipcRenderer.invoke('db:transaction:getParked'),
  getTransactionItems:(id)    => ipcRenderer.invoke('db:transaction:getItems', id),
  getTransactionPayments:(id) => ipcRenderer.invoke('db:transaction:getPayments', id),
  deleteTransaction:  (id)    => ipcRenderer.invoke('db:transaction:delete', id),
  searchTransactions: (opts)  => ipcRenderer.invoke('db:transaction:search', opts),

  // Staff
  staffLogin:         (pin)   => ipcRenderer.invoke('db:staff:login', pin),
  getStaff:           ()      => ipcRenderer.invoke('db:staff:getAll'),
  getStaffWithPin:    (id)    => ipcRenderer.invoke('db:staff:getWithPin', id),
  upsertStaff:        (s)    => ipcRenderer.invoke('db:staff:upsert', s),
  bulkUpsertStaff:    (arr)   => ipcRenderer.invoke('db:staff:bulkUpsert', arr),

  // Settings
  getSetting:         (key)   => ipcRenderer.invoke('db:settings:get', key),
  getAllSettings:      ()      => ipcRenderer.invoke('db:settings:getAll'),
  setSetting:         (k, v)  => ipcRenderer.invoke('db:settings:set', k, v),
  bulkUpsertSettings: (arr)   => ipcRenderer.invoke('db:settings:bulkUpsert', arr),

  // Sync
  getSyncPending:     ()      => ipcRenderer.invoke('db:sync:getPending'),
  markSynced:         (ids)   => ipcRenderer.invoke('db:sync:markSynced', ids),
  getDeletedRecords:  (table) => ipcRenderer.invoke('db:sync:getDeleted', table),

  // Reports
  dailySummary:       (date)  => ipcRenderer.invoke('db:reports:dailySummary', date),
  topProducts:        (date)  => ipcRenderer.invoke('db:reports:topProducts', date),
  salesByHour:        (date)  => ipcRenderer.invoke('db:reports:salesByHour', date),
  salesByMethod:      (date)  => ipcRenderer.invoke('db:reports:salesByMethod', date),
  salesByCategory:    (date)  => ipcRenderer.invoke('db:reports:salesByCategory', date),
  voidRefundCount:    (date)  => ipcRenderer.invoke('db:reports:voidRefundCount', date),
  zReport:            (date)  => ipcRenderer.invoke('db:reports:zReport', date),
  eodRegisterTotals:  (opts)  => ipcRenderer.invoke('db:reports:eodRegisterTotals', opts),
  weeklySummary:      (weekStart) => ipcRenderer.invoke('db:reports:weeklySummary', weekStart),

  // Insights
  getSalesHeatmap:    (days)          => ipcRenderer.invoke('db:insights:salesHeatmap', { days }),
  getDemandForecast:  ()              => ipcRenderer.invoke('db:insights:demandForecast'),
  getBoughtTogether:  ()              => ipcRenderer.invoke('db:insights:boughtTogether'),
  getXeroExport:      (dateFrom, dateTo) => ipcRenderer.invoke('db:insights:xeroExport', { dateFrom, dateTo }),
  getSalesTrend:      (days)          => ipcRenderer.invoke('db:insights:salesTrend', { days }),

  // Keyboard Layout
  getKeyboardButtons: ()      => ipcRenderer.invoke('db:keyboard:getAll'),
  getButtonsByPage:   (page)  => ipcRenderer.invoke('db:keyboard:getByPage', page),
  getPages:           ()      => ipcRenderer.invoke('db:keyboard:getPages'),
  getAllButtons:       ()      => ipcRenderer.invoke('db:keyboard:getAllIncludingInactive'),
  upsertButton:       (btn)   => ipcRenderer.invoke('db:keyboard:upsert', btn),
  deleteButton:       (id)    => ipcRenderer.invoke('db:keyboard:delete', id),
  deletePage:         (page)  => ipcRenderer.invoke('db:keyboard:deletePage', page),

  bulkUpsertKeyboard: (btns) => ipcRenderer.invoke('db:keyboard:bulkUpsert', btns),

  // Keyboard Pages
  createPage:         (opts)      => ipcRenderer.invoke('db:keyboard:createPage', opts),
  renamePage:         (page, name) => ipcRenderer.invoke('db:keyboard:renamePage', page, name),
  updatePageSize:     (page, cols, rows) => ipcRenderer.invoke('db:keyboard:updatePageSize', page, cols, rows),
  bulkUpsertKeyboardPages: (pages) => ipcRenderer.invoke('db:keyboard:bulkUpsertPages', pages),

  // Keyboard Extended
  copyPage:           (src, dest) => ipcRenderer.invoke('db:keyboard:copyPage', src, dest),
  exportKeyboard:     ()          => ipcRenderer.invoke('db:keyboard:export'),
  importKeyboard:     (data)      => ipcRenderer.invoke('db:keyboard:import', data),
  resetKeyboard:      ()          => ipcRenderer.invoke('db:keyboard:reset'),
  validateKeyboard:   ()          => ipcRenderer.invoke('db:keyboard:validate'),

  // Backups
  createBackup:       ()          => ipcRenderer.invoke('db:backup:create'),
  listBackups:        ()          => ipcRenderer.invoke('db:backup:list'),
  restoreBackup:      (name)      => ipcRenderer.invoke('db:backup:restore', name),
  openBackupFolder:   ()          => ipcRenderer.invoke('db:backup:openFolder'),

  // App Logs & Health
  getLogs:            (opts)      => ipcRenderer.invoke('app:logs:get', opts),
  getLogDates:        ()          => ipcRenderer.invoke('app:logs:dates'),
  clearLogs:          (date)      => ipcRenderer.invoke('app:logs:clear', date),
  exportLogs:         (date)      => ipcRenderer.invoke('app:logs:export', date),
  getHealth:          ()          => ipcRenderer.invoke('app:health'),
  getMode:            ()          => ipcRenderer.invoke('app:getMode'),

  // Audit Log
  logAudit:           (entry)     => ipcRenderer.invoke('db:audit:log', entry),
  searchAudit:        (opts)      => ipcRenderer.invoke('db:audit:search', opts),

  // Import
  importProducts:     (data)  => ipcRenderer.invoke('db:import:products', data),

  // Hardware
  printReceipt:       (data)  => ipcRenderer.invoke('hardware:printReceipt', data),
  openDrawer:         (opts)  => ipcRenderer.invoke('hardware:openDrawer', opts),
  probeDevices:       ()      => ipcRenderer.invoke('hardware:probe'),
  readScale:          ()      => ipcRenderer.invoke('hardware:readScale'),
  zeroScale:          ()      => ipcRenderer.invoke('hardware:zeroScale'),
  testScale:          (port, baud, protocol) => ipcRenderer.invoke('hardware:testScale', port, baud, protocol),
  getSerialPorts:     ()      => ipcRenderer.invoke('hardware:getSerialPorts'),
  testPrinter:        ()      => ipcRenderer.invoke('hardware:testPrinter'),
  testQueue:          (name)  => ipcRenderer.invoke('hardware:testQueue', name),
  getQueues:          ()      => ipcRenderer.invoke('hardware:getQueues'),
  configureHardware:  (cfg)   => ipcRenderer.invoke('hardware:configure', cfg),
  getHardwareConfig:  ()      => ipcRenderer.invoke('hardware:getConfig'),
  hardwareDiagnostic: ()      => ipcRenderer.invoke('hardware:diagnostic'),
  diagnoseEnvironment: ()     => ipcRenderer.invoke('hardware:diagnose'),

  // OPOS
  oposCheck:          ()      => ipcRenderer.invoke('hardware:oposCheck'),
  oposListDevices:    ()      => ipcRenderer.invoke('hardware:oposListDevices'),
  oposConfigure:      (cfg)   => ipcRenderer.invoke('hardware:oposConfigure', cfg),
  oposTestPrinter:    (name)  => ipcRenderer.invoke('hardware:oposTestPrinter', name),
  oposTestDrawer:     (name)  => ipcRenderer.invoke('hardware:oposTestDrawer', name),
  oposTestScale:      (name)  => ipcRenderer.invoke('hardware:oposTestScale', name),
  scaleDebug:         ()      => ipcRenderer.invoke('hardware:scaleDebug'),

  // Cash Drawer
  logCashDrawer:      (entry) => ipcRenderer.invoke('db:cash_drawer:log', entry),
  getCashDrawerLog:   (date)  => ipcRenderer.invoke('db:cash_drawer:getLog', date),
  getCashDrawerSummary:(date, registerId) => ipcRenderer.invoke('db:cash_drawer:summary', date, registerId),
  bulkUpsertCashDrawer:(arr)  => ipcRenderer.invoke('db:cashDrawer:bulkUpsert', arr),

  // Stock
  getLowStock:        ()      => ipcRenderer.invoke('db:stock:lowStock'),
  adjustStock:        (id, qty, reason) => ipcRenderer.invoke('db:stock:adjust', id, qty, reason),

  // Window
  exitFullscreen:     ()      => ipcRenderer.invoke('window:exitFullscreen'),
  toggleFullscreen:   ()      => ipcRenderer.invoke('window:toggleFullscreen'),
  getFullscreenState: ()      => ipcRenderer.invoke('window:getFullscreenState'),
  onFullscreenChanged:(cb)    => { ipcRenderer.removeAllListeners('window:fullscreen-changed'); ipcRenderer.on('window:fullscreen-changed', (_e, data) => cb(data)) },
  quit:               ()      => ipcRenderer.invoke('window:quit'),
  navigate:           (page)  => ipcRenderer.invoke('window:navigate', page),
  setMode:            (mode, role)  => ipcRenderer.invoke('window:setMode', mode, role),
  printHTML:           (html, title) => ipcRenderer.invoke('window:printHTML', html, title),

  // App Update
  updateApp:          (repoUrl) => ipcRenderer.invoke('app:update', repoUrl),
  getVersion:         ()      => ipcRenderer.invoke('app:version'),

  // LAN Sync
  getLanStatus:       ()           => ipcRenderer.invoke('lan:getStatus'),
  getLanPeers:        ()           => ipcRenderer.invoke('lan:getPeers'),
  lanSessionAction:   (action, staffId, staffName, registerId) => ipcRenderer.invoke('lan:sessionAction', action, staffId, staffName, registerId),
  testLanConnection:  (ip, port)   => ipcRenderer.invoke('lan:testConnection', ip, port),
  restartLan:         ()           => ipcRenderer.invoke('lan:restart'),
  discoverServer:     ()           => ipcRenderer.invoke('lan:discover'),
  networkDiagnostic:  ()           => ipcRenderer.invoke('lan:networkDiagnostic'),
  pushToRegisters:    ()           => ipcRenderer.invoke('lan:pushToRegisters'),

  // Customer Display
  customerUpdate:     (data)       => ipcRenderer.invoke('customer:update', data),
  customerSaleComplete: (data)     => ipcRenderer.invoke('customer:saleComplete', data),
  openCustomerDisplay: ()          => ipcRenderer.invoke('customer:open'),

  // Linkly Payment Terminal
  linklyGetStatus:    ()                    => ipcRenderer.invoke('linkly:getStatus'),
  linklyConfigure:    (opts)                => ipcRenderer.invoke('linkly:configure', opts),
  linklyTestConnection: ()                  => ipcRenderer.invoke('linkly:testConnection'),
  linklyPair:         (user, pass, code)    => ipcRenderer.invoke('linkly:pair', user, pass, code),
  linklyPurchase:     (amountCents, ref)    => ipcRenderer.invoke('linkly:purchase', amountCents, ref),
  linklyRefund:       (amountCents, ref)    => ipcRenderer.invoke('linkly:refund', amountCents, ref),
  linklyCancel:       ()                    => ipcRenderer.invoke('linkly:cancel'),
  linklySettlement:   ()                    => ipcRenderer.invoke('linkly:settlement'),
  onLinklyStatus:     (cb)                  => { ipcRenderer.removeAllListeners('linkly:status'); ipcRenderer.on('linkly:status', (_e, data) => cb(data)) },

  // Scale weight (continuous polling from main process)
  onScaleWeight:      (cb)                  => { ipcRenderer.removeAllListeners('scale:weight'); ipcRenderer.on('scale:weight', (_e, data) => cb(data)) },
  onHardwareIssues:   (cb)                  => { ipcRenderer.removeAllListeners('hardware:issues'); ipcRenderer.on('hardware:issues', (_e, data) => cb(data)) },

  // Scanner (OPOS-fed barcode events from main process)
  onScannerData:      (cb)                  => { ipcRenderer.removeAllListeners('scanner:data'); ipcRenderer.on('scanner:data', (_e, data) => cb(data)) },
  onScannerStatus:    (cb)                  => { ipcRenderer.removeAllListeners('scanner:status'); ipcRenderer.on('scanner:status', (_e, data) => cb(data)) },
  scannerRestart:     ()                    => ipcRenderer.invoke('hardware:scannerRestart'),
  scannerTest:        ()                    => ipcRenderer.invoke('hardware:scannerTest'),

  // LAN data changed (server pushed new data)
  onDataChanged:      (cb)                  => { ipcRenderer.removeAllListeners('lan:data-changed'); ipcRenderer.on('lan:data-changed', (_e, data) => cb(data)) },
})
