const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const defaultOut = path.join(path.dirname(ROOT), 'YieldPOS');
const OUT = path.resolve(process.argv[2] || defaultOut);

const ROOT_FILES = [
  'main.js',
  'preload.js',
  'lan-sync.js',
  'linkly.js',
  'package.json',
  'package-lock.json',
  'products.json',
  'keyboard-layout.json',
  'rawprint.ps1',
  'opos-bridge.ps1',
  'scale_reader.py',
  'scanner-bridge.exe',
  'scanner-bridge.cs',
  'setup-hardware.ps1',
  'test-scale.ps1',
  'test-scale.js',
  'sync-price-list.py',
  'copy-products-to-runtime.py',
  'snapshot-runtime-db.js',
  'reset-runtime-db.cmd',
  'reset-runtime-db.ps1',
  'update-runtime-db.cmd',
  'pull-from-supabase.js',
  'setup-supabase.js',
  'diagnose.js',
  'diagnose-scale.ps1',
];
const DIRS = ['pos', 'db', 'scripts', 'supabase'];
const EXES = [
  path.join(ROOT, 'dist3', 'YieldPOS-Client-1.0.0.exe'),
  path.join(ROOT, 'dist2', 'YieldPOS-Client-1.0.0.exe'),
];

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const file of ROOT_FILES) copyFileIfExists(path.join(ROOT, file), path.join(OUT, file));
  for (const dir of DIRS) copyDir(path.join(ROOT, dir), path.join(OUT, dir));
  const portableExe = EXES.find(exe => fs.existsSync(exe));
  if (portableExe) copyFileIfExists(portableExe, path.join(OUT, path.basename(portableExe)));

  fs.writeFileSync(path.join(OUT, 'README-FIRST.txt'), [
    'YieldPOS deployment package',
    '',
    'Use "YieldPOS Register.exe" to launch the register app.',
    'Use "YieldPOS Admin.exe" to launch the admin app.',
    '',
    'The portable app executable is included as YieldPOS-Client-1.0.0.exe.',
    'The source files that make up the app are included in pos/, db/, scripts/, and supabase/.',
    'Web-hosted product/keyboard images have been copied into pos/images/remote and database references point at local files.',
    '',
  ].join('\r\n'));

  console.log(OUT);
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileIfExists(from, to);
  }
}

function shouldSkip(name) {
  return ['.git', 'node_modules', 'dist', 'dist2', '__pycache__'].includes(name);
}

main();
