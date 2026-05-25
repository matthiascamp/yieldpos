const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const productsPath = path.join(root, 'products.json')
const dbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const reportsDir = path.join(root, 'reports')

const topProductsCsv = `website_product_name,top_products_pcode_reference_only
"(S) CAPSICUM TRAY KG","8723"
"(S) CHILLI BIRDS EYE","404"
"(S) FRUIT & VEG EA","386"
"(S) KG FRESH GALANGAL","2131"
"(S) KG FRESH TUMERIC","2132"
"(S) KG HOT GREEN CHILLI","2128"
"(S) KG JALAPENO CHILLI","2129"
"(S) OKRA KG","1285"
"(S) PAW PAW CUT","372"
"(S) PAW PAW RED CUT KG","394"
"(S) RED PAPAYA KG","8722"
"(S) SEEDLESS WATERMELON CUT KG","1834"
"(S) WATERMELON KG","377"
"(S)SEEDLESS WATERMELON WHOLE","9962"
"2KG BROWN ONIONS","19665"
"AEGEAN NATURAL AUST ALMONDS","15116"
"APPLES KANZI KG","21090"
"ASIAN VEGETABLES ASST EA","1007370"
"ASSORTED LETTUCE BAGS","22756"
"AUSTRALIAN D/ROAST ALMONDS","24612"
"AUSTRALIAN RED PEANUTS 175G","24607"
"AUSTRALIAN SMOKED ALMONDS 150G","24604"
"AVOCADO GREEN SKIN LGE SHEPHER","11823"
"AVOCADO NET BAG","9489"
"BANANAS CAVENDISH KG","1007847"
"BASIL FRESH  LGE BUNCH","1007733"
"BEAN SPROUTS 250G","22572"
"BROCCOLI","1007281"
"CARROTS  BAG","18223"
"CARROTS 1 KG","19524"
"CARROTS 1 KG BAG","27875"
"CHIVES BUNCH","10915"
"COCO THUMB SIP DRINKING","27340"
"COCONUTS DRY SKIN EA","1007889"
"CORIANDER FRESH  LGE BUNCH","1007728"
"CUCUMBER BUCKET KG","27337"
"CURRY LEAVES 15G","22593"
"CUSTARD APPLE KG","1007892"
"DELICIOUS MIX 160G","24601"
"DILL LARGE BUNCH","16676"
"FETTA","1008093"
"GARLIC AUSTRALIAN","391"
"GARLIC KG","1001531"
"GINGER CRYSTALISED 200G","24613"
"GOLDEN QUEEN","1008116"
"GRANNY SMITH SMALL KG","1007806"
"GRAPES","1007906"
"GREEN CHILLI SWEET KG","1007364"
"JAP PUMPKIN OUTSIDE KG","7318"
"JAZZ APPLE KG","19000"
"KAFFIR LIME LEAF","22626"
"KG LYCHEE","1007971"
"KIWI FRUIT GOLD EA","1008295"
"LARGE HERB BUNCH","16674"
"LEMON GRASS","27167"
"LETTUCE ICEBERG EA.","1007472"
"LITTLE DARLINGS BLUEBERRIES","27876"
"MANDARINES AFROURER KG","1008281"
"MANDARINES MURCOTT KG","1007969"
"MANGOES CALYPSO EA","19772"
"MANGOES KEITT EA","1008276"
"MANGOES KP","1007988"
"MARKET GROCER SOUR WORMS 200G","24830"
"MINT FRESH LARGE","10968"
"NAVEL ORANGE","20391"
"ONIONS SPANISH 1 KG BAG","1008508"
"ORANGE  3 KG BAG","1006965"
"ORANGE CANDY MELON WHOLE EA","20204"
"ORANGES  VALENCIA KG","8291"
"OUTDOOR MIX 160G","24611"
"OUTSIDE ROCKMELON EA","27551"
"PARSLEY CONTINENTAL BUNCH","1007721"
"PARSLEY CURLY BUNCH","1007720"
"PEACH YELLOW KG","1008104"
"PEARS NASHI YA PEARS","1008201"
"PERSIMMON KG","1008089"
"PINK LADY APPLE SPECIAL","1007792"
"PISTACHIO SALTED 175G","24610"
"PLUMS SUGAR KG","1008160"
"POMMELO  KG","21343"
"POPPING CORN 500G","24595"
"RED PLUMS KG","18371"
"ROSEMARY BUNCH","16044"
"ROYAL GALA SMALL","1007801"
"SWEET POTATOES OUTSIDE","21156"
"TOMATOES ROMA PER KG","1007669"
"TOMATOES ROUND KG","1007647"
"TOMATOES TRUSS VINE  KG","1007704"
"WATERCRESS BUNCH","1007735"
"WATERMELON SEEDED LONG WHOLE","1008234"
"WATERMELON SEEDLESS WHOLE KG","1008015"
"YELLOW SPLIT PEAS 500G","24596"`

function parseCsvLine (line) {
  const values = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (ch === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current)
  return values
}

function parseTopProducts () {
  return topProductsCsv.trim().split(/\r?\n/).slice(1).map(line => {
    const [website_product_name, top_products_pcode_reference_only] = parseCsvLine(line)
    return { source_section: 'top_products', website_product_name, top_products_pcode_reference_only }
  })
}

function baseName (value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^\(S\)\s*/, '')
    .replace(/&/g, ' AND ')
    .replace(/D\/ROAST/g, 'DRY ROAST')
    .replace(/\bTUMERIC\b/g, 'TURMERIC')
    .replace(/\bKANZIL\b/g, 'KANZI')
    .replace(/\bSHEPHER\b/g, 'SHEPHERD')
    .replace(/\bMANDARINES\b/g, 'MANDARINS')
    .replace(/\bCOCO\b/g, 'COCONUT')
    .replace(/(\d+)\s*KG\b/g, '$1 KG')
    .replace(/(\d+)\s*G\b/g, '$1 G')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const stopWords = new Set([
  'KG', 'KGS', 'PER', 'EA', 'EACH', 'LGE', 'LARGE', 'SML', 'SM', 'SMALL',
  'FRESH', 'ASST', 'ASSORTED', 'AUST', 'AUSTRALIAN', 'BAG', 'BAGS', 'NET',
  'TRAY', 'CUT', 'WHOLE', 'OUTSIDE', 'IN', 'OF', 'PUNNET', 'PUNNETS'
])

const curatedLookupOverrides = new Map([
  ['AVOCADO GREEN SKIN LGE SHEPHER', '41522'],
  ['AVOCADO GREEN SKIN LGE', '41522'],
  ['AVOCADO REED', '4157'],
  ['AVOCADOES SMALL EA', '4155'],
  ['BANANAS LADYFINGER KG', '4221'],
  ['COCONUTS DRY SKIN EA', '4382'],
  ['GRANNY SMITH SMALL KG', '4075'],
  ['GREEN CHILLI SWEET KG', '1541'],
  ['KIWI FRUIT KG', '4612'],
  ['LIME NET BAG 6PK', '46422'],
  ['LITTLE DARLINGS BLUEBERRIES', '9421007560242'],
  ['MANDARINES AFROURER KG', '5791'],
  ['MANDARINES DAISY KG', '4457'],
  ['MANDARINES EMPRESS KG', '4661'],
  ['MANDARINES MURCOT KG', '4665'],
  ['MANDARINES MURCOTT KG', '4665'],
  ['MELON HONEY DEW EA', '4722'],
  ['PEARS NASHI YA PEARS', '5392'],
  ['PINK LADY APPLE SPECIAL', '4031'],
  ['RED IMPERIAL MANDARIN KG', '5821'],
  ['CHILLI HOT KG', '1511'],
  ['CHILLI SWEET KG', '1541'],
  ['CHILLIES GREEN KG', '1521'],
  ['ONIONS SALAD SPANISH KG', '2441'],
  ['POTATOES BRUSHED 3KG', '20158']
].map(([name, code]) => [baseName(name), code]))

function singular (token) {
  const map = {
    APPLES: 'APPLE',
    ORANGES: 'ORANGE',
    ONIONS: 'ONION',
    BANANAS: 'BANANA',
    MANGOES: 'MANGO',
    TOMATOES: 'TOMATO',
    POTATOES: 'POTATO',
    MANDARINS: 'MANDARIN',
    GRAPES: 'GRAPE',
    PLUMS: 'PLUM',
    PEARS: 'PEAR',
    COCONUTS: 'COCONUT',
    VEGETABLES: 'VEGETABLE'
  }
  if (map[token]) return map[token]
  if (token.endsWith('IES') && token.length > 4) return token.slice(0, -3) + 'Y'
  if (token.endsWith('S') && token.length > 4 && !token.endsWith('SS')) return token.slice(0, -1)
  return token
}

function tokens (value) {
  return baseName(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => !stopWords.has(token))
    .map(singular)
}

function tokenKey (value) {
  return [...new Set(tokens(value))].sort().join(' ')
}

function tokenScore (left, right) {
  const a = new Set(tokens(left))
  const b = new Set(tokens(right))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  return (2 * intersection) / (a.size + b.size)
}

function rows (db, sql, params = []) {
  const result = db.exec(sql, params)
  if (!result.length) return []
  return result[0].values.map(values => Object.fromEntries(result[0].columns.map((col, index) => [col, values[index]])))
}

function csvEscape (value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function productCodes (product) {
  return [...new Set([product.plu, product.barcode].map(value => String(value || '').trim()).filter(Boolean))]
}

function buildLookupIndex (products) {
  const byCode = new Map()
  for (const product of products) {
    for (const code of productCodes(product)) {
      if (!byCode.has(code)) byCode.set(code, new Map())
      byCode.get(code).set(product.id, product)
    }
  }
  return byCode
}

function uniqueLookupCount (byCode, code) {
  return code && byCode.has(code) ? byCode.get(code).size : 0
}

function hasUniqueLookupCode (product, byCode) {
  return productCodes(product).some(code => {
    const matches = byCode.get(code)
    return matches && matches.size === 1 && matches.has(product.id)
  })
}

function preferredCode (product, byCode) {
  for (const code of [product.plu, product.barcode].map(value => String(value || '').trim()).filter(Boolean)) {
    const matches = byCode.get(code)
    if (matches && matches.size === 1 && matches.has(product.id)) return code
  }
  return String(product.plu || product.barcode || '').trim()
}

function bestMatch (item, products) {
  const scored = products.map(product => {
    let score = tokenScore(item.website_product_name, product.name)
    if (baseName(item.website_product_name) === baseName(product.name)) score = Math.max(score, 1)
    if (tokenKey(item.website_product_name) === tokenKey(product.name)) score = Math.max(score, 0.95)
    if (productCodes(product).includes(String(item.top_products_pcode_reference_only || ''))) score += 0.08
    return { product, score }
  }).sort((a, b) => b.score - a.score || String(a.product.name).length - String(b.product.name).length)
  return scored[0] || { product: null, score: 0 }
}

function resolveItem (item, products, byCode) {
  const overrideCode = curatedLookupOverrides.get(baseName(item.website_product_name))
  if (overrideCode) {
    const matches = byCode.get(overrideCode)
    const product = matches && matches.size === 1 ? [...matches.values()][0] : null
    if (product) {
      return {
        source_section: item.source_section,
        website_product_name: item.website_product_name,
        top_products_pcode_reference_only: item.top_products_pcode_reference_only || '',
        status: 'safe',
        suggested_lookup_code: overrideCode,
        candidate_lookup_code: overrideCode,
        lookup_source: 'curated_produce_alias',
        match_score: 1,
        matched_product_id: product.id,
        matched_product_name: product.name,
        matched_category: product.category,
        matched_price: product.price,
        matched_unit: product.unit,
        matched_open_price: product.open_price,
        active_lookup_count: matches.size
      }
    }
  }

  const codedProducts = products.filter(product => hasUniqueLookupCode(product, byCode))
  const searchProducts = codedProducts.length ? codedProducts : products
  const exact = searchProducts.filter(product => baseName(product.name) === baseName(item.website_product_name))
  const loose = searchProducts.filter(product => tokenKey(product.name) === tokenKey(item.website_product_name))
  const byReference = searchProducts.filter(product => productCodes(product).includes(String(item.top_products_pcode_reference_only || '')))
  const ranked = exact.length
    ? { product: exact[0], score: 1, source: 'exact_active_db_name' }
    : loose.length
      ? { ...bestMatch(item, loose), source: 'loose_active_db_name' }
      : byReference.length
        ? { ...bestMatch(item, byReference), source: 'active_db_reference_code_name_check' }
        : { ...bestMatch(item, searchProducts), source: 'best_active_db_name_match' }

  const product = ranked.product
  const code = product ? preferredCode(product, byCode) : ''
  const lookupCount = uniqueLookupCount(byCode, code)
  let status = 'manual_review'
  if (product && ranked.score >= 0.95 && lookupCount === 1) status = 'safe'
  else if (product && ranked.score >= 0.78 && lookupCount === 1) status = 'review_recommended'

  return {
    source_section: item.source_section,
    website_product_name: item.website_product_name,
    top_products_pcode_reference_only: item.top_products_pcode_reference_only || '',
    status,
    suggested_lookup_code: status === 'manual_review' ? '' : code,
    candidate_lookup_code: code,
    lookup_source: ranked.source,
    match_score: Number(ranked.score.toFixed(2)),
    matched_product_id: product ? product.id : '',
    matched_product_name: product ? product.name : '',
    matched_category: product ? product.category : '',
    matched_price: product ? product.price : '',
    matched_unit: product ? product.unit : '',
    matched_open_price: product ? product.open_price : '',
    active_lookup_count: lookupCount
  }
}

async function main () {
  const productsJson = JSON.parse(fs.readFileSync(productsPath, 'utf8'))
  const fruitVegItems = []
  for (const category of ['Fruit', 'Vegetables']) {
    for (const product of productsJson[category] || []) {
      fruitVegItems.push({
        source_section: category,
        website_product_name: product.name,
        products_json_code: String(product.barcode || product.plu || '').trim()
      })
    }
  }

  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const products = rows(db, `
    SELECT p.id, p.name, p.plu, p.barcode, p.price, p.unit, p.open_price, p.active, c.name AS category
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1
  `)
  const byCode = buildLookupIndex(products)

  const topProductMappings = parseTopProducts().map(item => resolveItem(item, products, byCode))
  const fruitVegMappings = fruitVegItems.map(item => {
    const resolved = resolveItem(item, products, byCode)
    resolved.products_json_code = item.products_json_code
    resolved.products_json_code_lookup_count = uniqueLookupCount(byCode, item.products_json_code)
    resolved.products_json_code_matches_suggested = item.products_json_code === resolved.suggested_lookup_code ? 'yes' : 'no'
    return resolved
  })

  const all = [...topProductMappings, ...fruitVegMappings]
  const summary = all.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  fs.mkdirSync(reportsDir, { recursive: true })
  const jsonPath = path.join(reportsDir, 'website-live-lookup-map.json')
  const csvPath = path.join(reportsDir, 'website-live-lookup-map.csv')
  const mdPath = path.join(reportsDir, 'website-live-lookup-map.md')

  const payload = {
    generated_at: new Date().toISOString(),
    note: 'Use suggested_lookup_code against Supabase products.plu/products.barcode. top_products_pcode_reference_only is kept for audit only.',
    summary,
    top_products: topProductMappings,
    fruit_vegetables: fruitVegMappings
  }
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2))

  const fields = [
    'source_section',
    'website_product_name',
    'top_products_pcode_reference_only',
    'products_json_code',
    'status',
    'suggested_lookup_code',
    'candidate_lookup_code',
    'lookup_source',
    'match_score',
    'matched_product_name',
    'matched_category',
    'matched_price',
    'matched_unit',
    'matched_open_price',
    'matched_product_id',
    'active_lookup_count',
    'products_json_code_lookup_count',
    'products_json_code_matches_suggested'
  ]
  fs.writeFileSync(csvPath, [
    fields.join(','),
    ...all.map(row => fields.map(field => csvEscape(row[field])).join(','))
  ].join('\n'))

  const needsReview = all.filter(row => row.status !== 'safe')
  fs.writeFileSync(mdPath, [
    '# Website Live Lookup Map',
    '',
    'Use `suggested_lookup_code` for Supabase lookups against `products.plu` or `products.barcode`.',
    'The `top_products_pcode_reference_only` column is audit context only; it should not be treated as the live lookup code.',
    '',
    `Generated: ${payload.generated_at}`,
    '',
    '## Summary',
    '',
    `- Total rows: ${all.length}`,
    `- Safe: ${summary.safe || 0}`,
    `- Review recommended: ${summary.review_recommended || 0}`,
    `- Manual review: ${summary.manual_review || 0}`,
    '',
    '## Rows Needing Review',
    '',
    needsReview.length
      ? [
          '| Source | Website product | Suggested code | Matched product | Status | Score |',
          '| --- | --- | --- | --- | --- | --- |',
          ...needsReview.map(row => `| ${row.source_section} | ${row.website_product_name} | ${row.suggested_lookup_code} | ${row.matched_product_name} | ${row.status} | ${row.match_score} |`)
        ].join('\n')
      : 'None.',
    ''
  ].join('\n'))

  console.log(JSON.stringify({ summary, jsonPath, csvPath, mdPath }, null, 2))
}

main().catch(err => {
  console.error(err.stack || err.message)
  process.exit(1)
})
