const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.argv[2] || path.join(ROOT, 'db', 'crisp-pos.sqlite');
const IMAGE_DIR = path.join(ROOT, 'pos', 'images', 'remote');
const DB_FIELDS = [
  { table: 'keyboard_buttons', field: 'image', id: 'id' },
  { table: 'products', field: 'image_url', id: 'id' },
];
const TEXT_FILES = [
  'main.js',
  'db/keyboard-catpages.js',
  'db/keyboard-subpages.js',
  'db/schema.sql',
  'products.json',
  'keyboard-layout.json',
];

const IMAGE_HOSTS = [
  'shop.coles.com.au',
  'cdn0.woolworths.media',
  'images.pexels.com',
  'raw.githubusercontent.com',
  'pngimg.com',
  'ubgeneralstore.com.au',
  'upload.wikimedia.org',
];

async function main() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const SQL = await require('sql.js')();
  const db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : null;

  const urlToLocal = new Map();
  const urls = new Set();
  const dbRows = [];

  if (db) {
    for (const { table, field, id } of DB_FIELDS) {
      for (const row of query(db, `SELECT ${id} AS id, ${field} AS value FROM ${table} WHERE ${field} LIKE 'http%'`)) {
        if (isImageUrl(row.value)) {
          urls.add(row.value);
          dbRows.push({ table, field, idField: id, idValue: row.id, url: row.value });
        }
      }
    }
  }

  const fileTexts = new Map();
  for (const rel of TEXT_FILES) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    fileTexts.set(file, text);
    for (const url of extractUrls(text)) {
      if (isImageUrl(url)) urls.add(url);
    }
  }

  let downloaded = 0;
  let reused = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const local = await downloadImage(url);
      if (local.existed) reused++;
      else downloaded++;
      urlToLocal.set(url, local.relative);
    } catch (err) {
      failed++;
      console.warn(`failed ${url}: ${err.message}`);
    }
  }

  let dbUpdates = 0;
  if (db) {
    for (const row of dbRows) {
      const local = urlToLocal.get(row.url);
      if (!local) continue;
      run(db, `UPDATE ${row.table} SET ${row.field} = ? WHERE ${row.idField} = ?`, [local, row.idValue]);
      dbUpdates++;
    }
    if (dbUpdates) fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    db.close();
  }

  let fileUpdates = 0;
  for (const [file, original] of fileTexts) {
    let updated = original;
    for (const [url, local] of urlToLocal) {
      updated = updated.split(url).join(local);
    }
    if (updated !== original) {
      fs.writeFileSync(file, updated);
      fileUpdates++;
    }
  }

  console.log(JSON.stringify({
    urls: urls.size,
    downloaded,
    reused,
    failed,
    dbUpdates,
    fileUpdates,
    imageDir: path.relative(ROOT, IMAGE_DIR).replace(/\\/g, '/'),
  }, null, 2));

  if (failed) process.exitCode = 2;
}

async function downloadImage(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
  const initialExt = extFromUrl(url);
  const slug = slugFromUrl(url);
  const existing = fs.readdirSync(IMAGE_DIR).find(name => name.includes(hash));
  if (existing) return { relative: toAppImagePath(path.join(IMAGE_DIR, existing)), existed: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'YieldPOS image localizer' } });
  } finally {
    clearTimeout(timer);
  }
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 'failed'}`);
  const contentType = res.headers.get('content-type') || '';
  if (!/^image\//i.test(contentType) && !initialExt) throw new Error(`not an image (${contentType || 'unknown content-type'})`);
  const ext = extFromContentType(contentType) || initialExt || '.jpg';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('empty response');
  const file = path.join(IMAGE_DIR, `${slug}-${hash}${ext}`);
  fs.writeFileSync(file, buffer);
  return { relative: toAppImagePath(file), existed: false };
}

function extractUrls(text) {
  return [...text.matchAll(/https?:\/\/[^'"`\s)]+/g)].map(match => match[0].replace(/[>,.;]+$/, ''));
}

function isImageUrl(value) {
  if (!value) return false;
  if (String(value).includes('${')) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (!IMAGE_HOSTS.includes(parsed.hostname)) return false;
  return /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
}

function extFromUrl(value) {
  try {
    const ext = path.extname(new URL(value).pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) return ext;
  } catch {}
  return '';
}

function extFromContentType(type) {
  const clean = String(type || '').toLowerCase();
  if (clean.includes('png')) return '.png';
  if (clean.includes('webp')) return '.webp';
  if (clean.includes('gif')) return '.gif';
  if (clean.includes('avif')) return '.avif';
  if (clean.includes('jpeg') || clean.includes('jpg')) return '.jpg';
  return '';
}

function slugFromUrl(value) {
  try {
    const parsed = new URL(value);
    const base = path.basename(parsed.pathname).replace(/\.[a-z0-9]+$/i, '') || parsed.hostname;
    return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'image';
  } catch {
    return 'image';
  }
}

function toAppImagePath(file) {
  return path.relative(path.join(ROOT, 'pos'), file).replace(/\\/g, '/');
}

function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
