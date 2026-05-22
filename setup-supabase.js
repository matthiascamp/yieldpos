#!/usr/bin/env node
// Setup Supabase: create tables + populate products from crisponcreek GitHub repo

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const GITHUB_RAW = 'https://raw.githubusercontent.com/matthiascamp/crisponcreek/main';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function supabaseGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function supabasePost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function supabaseUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'return=representation,resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`UPSERT ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function checkTablesExist() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?limit=0`, { headers });
  return res.ok;
}

async function main() {
  console.log('=== Crisp POS Supabase Setup ===\n');

  // Step 1: Check if tables exist
  console.log('Checking if tables exist...');
  const tablesExist = await checkTablesExist();

  if (!tablesExist) {
    console.log('\n❌ Tables do not exist yet!');
    console.log('\nPlease run the schema SQL in your Supabase SQL Editor:');
    console.log(`  1. Go to: https://supabase.com/dashboard/project/xdcthdztlfjajsugubaz/sql`);
    console.log(`  2. Open the file: supabase/schema.sql`);
    console.log(`  3. Paste the contents and click "Run"`);
    console.log(`  4. Then run this script again.\n`);
    process.exit(1);
  }
  console.log('✓ Tables exist\n');

  // Step 2: Fetch product data from GitHub
  console.log('Fetching products.json from GitHub...');
  const productsRes = await fetch(`${GITHUB_RAW}/products.json`);
  const productsData = await productsRes.json();

  console.log('Fetching top_products.json (for images)...');
  const topRes = await fetch(`${GITHUB_RAW}/top_products.json`);
  const topProducts = await topRes.json();

  // Build image lookup from top_products.json (name -> img URL)
  const imageLookup = {};
  for (const p of topProducts) {
    if (p.img) {
      const key = p.name.trim().toLowerCase();
      imageLookup[key] = `${GITHUB_RAW}/${p.img}`;
    }
  }
  console.log(`✓ Image lookup built: ${Object.keys(imageLookup).length} products with images\n`);

  // Step 3: Insert categories
  console.log('Inserting categories...');
  const categoryNames = Object.keys(productsData);
  const categoryMap = {}; // name -> uuid

  for (let i = 0; i < categoryNames.length; i++) {
    const name = categoryNames[i];
    try {
      const result = await supabasePost('categories', {
        name,
        sort_order: i,
        active: true
      });
      categoryMap[name] = result[0].id;
      process.stdout.write(`  ✓ ${name} (${productsData[name].length} products)\n`);
    } catch (e) {
      // Category might already exist, try to find it
      const existing = await supabaseGet('categories', `name=eq.${encodeURIComponent(name)}&limit=1`);
      if (existing && existing.length > 0) {
        categoryMap[name] = existing[0].id;
        process.stdout.write(`  ○ ${name} (already exists)\n`);
      } else {
        console.error(`  ✗ ${name}: ${e.message}`);
      }
    }
  }
  console.log(`\n✓ ${Object.keys(categoryMap).length} categories ready\n`);

  // Step 4: Insert products in batches
  console.log('Inserting products...');
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [categoryName, products] of Object.entries(productsData)) {
    const categoryId = categoryMap[categoryName];
    if (!categoryId) {
      console.error(`  ✗ Skipping ${categoryName} — no category ID`);
      continue;
    }

    // Determine unit based on category and product names
    const isWeighed = (name) => {
      const lower = name.toLowerCase();
      return lower.includes('/kg') || lower.includes('per kg') ||
        (categoryName === 'Fruit' && !lower.includes('punnet') && !lower.includes('pack') && !lower.includes('bag') && !lower.includes('tray')) ||
        (categoryName === 'Vegetables' && !lower.includes('punnet') && !lower.includes('pack') && !lower.includes('bag') && !lower.includes('tray'));
    };

    // Prepare batch
    const batch = products.map(p => {
      const imgKey = p.name.trim().toLowerCase();
      const imageUrl = imageLookup[imgKey] || null;

      // Determine unit: fruit/veg by weight unless packaged
      let unit = 'each';
      if (isWeighed(p.name)) unit = 'kg';
      if (p.unit) unit = p.unit;

      return {
        barcode: p.barcode || null,
        plu: p.pcode || null,
        name: p.name,
        category_id: categoryId,
        price: p.price,
        cost_price: 0,
        unit,
        tax_rate: 0.10,
        track_stock: false,
        stock_qty: 0,
        active: true,
        image_url: imageUrl
      };
    });

    // Insert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      try {
        await supabasePost('products', chunk);
        totalInserted += chunk.length;
      } catch (e) {
        // Try one-by-one for failed chunks
        for (const item of chunk) {
          try {
            await supabasePost('products', item);
            totalInserted++;
          } catch (e2) {
            totalErrors++;
          }
        }
      }
    }
    console.log(`  ✓ ${categoryName}: ${products.length} products`);
  }

  // Step 5: Enrich with pcode/sales data from top_products where missing
  console.log('\nEnriching products with PLU codes from top_products...');
  let enriched = 0;
  for (const tp of topProducts) {
    if (!tp.pcode) continue;
    // Find product by exact name match
    const found = await supabaseGet('products', `name=eq.${encodeURIComponent(tp.name)}&limit=1`);
    if (found && found.length > 0 && !found[0].plu) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${found[0].id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ plu: String(tp.pcode) })
        });
        if (res.ok) enriched++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`✓ Enriched ${enriched} products with PLU codes\n`);

  // Summary
  console.log('=== DONE ===');
  console.log(`Categories: ${Object.keys(categoryMap).length}`);
  console.log(`Products inserted: ${totalInserted}`);
  console.log(`Products with images: ${Object.keys(imageLookup).length}`);
  console.log(`PLU codes added: ${enriched}`);
  if (totalErrors > 0) console.log(`Errors: ${totalErrors}`);
  console.log(`\nYour Supabase database is ready!`);
  console.log(`Dashboard: https://supabase.com/dashboard/project/xdcthdztlfjajsugubaz/editor`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
