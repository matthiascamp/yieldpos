const fs = require('fs');

async function main() {
  const [dbPath, imagePath, ...ids] = process.argv.slice(2);
  if (!dbPath || !imagePath || ids.length === 0) {
    console.error('usage: node scripts/set-local-image.js <db> <image-path> <id...>');
    process.exit(1);
  }
  const SQL = await require('sql.js')();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const buttonStmt = db.prepare('UPDATE keyboard_buttons SET image = ? WHERE id = ?');
  const productStmt = db.prepare('UPDATE products SET image_url = ?, updated_at = datetime("now") WHERE id = ?');
  for (const id of ids) {
    buttonStmt.run([imagePath, id]);
    productStmt.run([imagePath, id]);
  }
  buttonStmt.free();
  productStmt.free();
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
