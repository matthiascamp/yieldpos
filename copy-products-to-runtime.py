import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE_DB = ROOT / "db" / "crisp-pos.sqlite"
RUNTIME_DB = Path(os.environ.get("APPDATA", "")) / "YieldPOS Client" / "crisp-pos.sqlite"

TABLES = ("categories", "products")


def copy_table(src, dst, table):
    rows = src.execute(f"SELECT * FROM {table}").fetchall()
    cols = [row[1] for row in src.execute(f"PRAGMA table_info({table})").fetchall()]
    placeholders = ",".join("?" for _ in cols)
    col_sql = ",".join(cols)
    dst.execute(f"DELETE FROM {table}")
    dst.executemany(f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders})", rows)
    return len(rows)


def main():
    if not SOURCE_DB.exists():
        raise SystemExit(f"Missing source DB: {SOURCE_DB}")
    if not RUNTIME_DB.exists():
        raise SystemExit(f"Missing runtime DB: {RUNTIME_DB}")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = RUNTIME_DB.with_name(f"{RUNTIME_DB.stem}.before-product-copy-{stamp}{RUNTIME_DB.suffix}")
    shutil.copy2(RUNTIME_DB, backup)

    src = sqlite3.connect(SOURCE_DB)
    dst = sqlite3.connect(RUNTIME_DB)
    dst.execute("PRAGMA foreign_keys = OFF")
    counts = {}
    for table in TABLES:
        counts[table] = copy_table(src, dst, table)
    dst.commit()
    src.close()
    dst.close()
    print({"runtime": str(RUNTIME_DB), "backup": str(backup), "copied": counts})


if __name__ == "__main__":
    main()
