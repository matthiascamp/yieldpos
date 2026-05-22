import csv
import json
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import xlrd


ROOT = Path(__file__).resolve().parent
PRICE_LIST = ROOT / "Price list (20-04-2026 17.02.04).XLS"
DB_PATHS = [
    ROOT / "db" / "crisp-pos.sqlite",
    Path(os.environ.get("APPDATA", "")) / "YieldPOS Client" / "crisp-pos.sqlite",
]

CATEGORY_MAP = {
    "1.FRUIT": ("cat-fruit", "Fruit"),
    "2.VEGIES": ("cat-veg", "Vegetables"),
    "3.HERBS FRESH": ("eeef6c48-d58f-4b92-b2f4-ab41e88e28a5", "Fresh Herbs"),
    "4.DELI": ("cat-deli", "Deli"),
    "5.DELI SERVICE": ("cat-deli", "Deli"),
    "6.GROCERY": ("cat-grocery", "Grocery"),
    "7.FREEZER": ("ce2076a0-88da-4fc4-b996-767773d894b7", "Freezer"),
    "8.FLOWERS": ("cat-flowers", "Flowers"),
    "9.NUTS": ("cat-nuts", "Nuts"),
    "10.CONFECT": ("584d2762-9e80-43d1-9f05-4477731ebece", "Confectionery"),
    "11.BREAD": ("cat-bread", "Bread & Croissants"),
    "12.TUB/DRIED FRUIT": ("ba5330ca-a123-4db5-8a84-ad8ad1b048c8", "Dried Fruit & Nuts"),
    "13.MILK": ("cat-dairy", "Dairy"),
    "14.EGGS": ("c6e21cc0-aa3f-4f44-9c02-2201b4c0e871", "Eggs"),
    "15. BAGS": ("cat-bags", "Bags"),
    "15.JUICE FRESH O.J.": ("b1ce80ad-5fd4-43e9-966d-257478690b36", "Fresh Juice"),
    "16.DRINKS": ("98278373-18c3-45fe-ba1c-3c891de1c628", "Drinks"),
    "17.NEWSAGENT": ("bbd6f9d7-8721-469a-97dc-86a108c348f2", "Newsagent"),
    "22.FRUIT WHOLESALE": ("cat-fruit", "Fruit"),
    "23.VEGIES WHOLESALE": ("cat-veg", "Vegetables"),
    "CARDS": ("02d78799-a31e-40e1-864a-4035bb3bef40", "Cards & Ice Cream"),
    "COFFEE": ("cat-coffee", "Coffee"),
    "MEAT": ("cat-meat", "Meat"),
    "UBER EATS": ("cat-uber-eats", "Uber Eats"),
}

OPEN_PRICE_NAMES = {
    "FRUIT VEG EA",
    "FRUIT VEG KG",
    "DELI/DAIRY",
    "SERVICE DELI",
    "FLOWERS BUNCH ASST",
    "COFFEE",
    "MEAT",
}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def norm(value):
    s = clean(value).upper()
    s = re.sub(r"^\(S\)\s*", "", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def fmt_code(value):
    if value == "":
        return ""
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:.0f}"
    return clean(value)


def parse_price_list():
    book = xlrd.open_workbook(str(PRICE_LIST))
    sheet = book.sheet_by_index(0)
    dept = ""
    rows = []
    for r in range(sheet.nrows):
        marker = sheet.cell_value(r, 3)
        if marker == "Department:":
            dept = clean(sheet.cell_value(r, 6))
            continue
        desc = clean(sheet.cell_value(r, 2))
        pcode = sheet.cell_value(r, 1)
        if not desc or not isinstance(pcode, float):
            continue
        plu = fmt_code(sheet.cell_value(r, 9))
        price = sheet.cell_value(r, 33) or sheet.cell_value(r, 21) or sheet.cell_value(r, 18) or 0
        cat_id, cat_name = CATEGORY_MAP.get(dept, ("cat-grocery", "Grocery"))
        normalized_name = norm(desc)
        is_open = normalized_name in OPEN_PRICE_NAMES or float(price or 0) == 0
        rows.append({
            "source_row": r + 1,
            "pcode": fmt_code(pcode),
            "plu": plu,
            "barcode": plu,
            "name": desc,
            "norm_name": normalized_name,
            "price": 0.0 if is_open else round(float(price or 0), 2),
            "unit": "kg" if re.search(r"(\bKG\b|PER KG|/KG)", desc, re.I) else "each",
            "open_price": 1 if is_open else 0,
            "category_id": cat_id,
            "category_name": cat_name,
            "dept": dept,
        })
    return rows


def table_rows(con, sql, params=()):
    con.row_factory = sqlite3.Row
    return [dict(row) for row in con.execute(sql, params)]


def ensure_categories(con):
    for cat_id, name in sorted(set(CATEGORY_MAP.values())):
        con.execute(
            """
            INSERT INTO categories (id, name, sort_order, colour, active, updated_at)
            VALUES (?, ?, 999, '#4fbd77', 1, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              active = 1,
              updated_at = datetime('now')
            """,
            (cat_id, name),
        )


def next_available_plu(con, used):
    current = 900000
    numeric = [
        int(row["plu"])
        for row in table_rows(con, "SELECT plu FROM products WHERE plu GLOB '[0-9]*'")
        if str(row["plu"]).isdigit() and int(row["plu"]) < 900000
    ]
    if numeric:
        current = max(current, max(numeric) + 1)
    while str(current) in used:
        current += 1
    used.add(str(current))
    return str(current)


def sync_db(db_path, price_rows):
    if not db_path.exists():
        return {"db": str(db_path), "skipped": "missing"}

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = db_path.with_name(f"{db_path.stem}.before-price-list-{stamp}{db_path.suffix}")
    shutil.copy2(db_path, backup)

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = OFF")
    ensure_categories(con)

    products = table_rows(con, "SELECT * FROM products")
    keyboard_links = {row["product_id"] for row in table_rows(con, "SELECT DISTINCT product_id FROM keyboard_buttons WHERE product_id IS NOT NULL AND product_id != ''")}
    by_plu = {}
    by_name = {}
    for p in products:
        if p.get("plu"):
            by_plu.setdefault(str(p["plu"]), []).append(p)
        by_name.setdefault(norm(p["name"]), []).append(p)

    report = {
        "db": str(db_path),
        "backup": str(backup),
        "updated": 0,
        "inserted": 0,
        "moved_conflicts": 0,
        "relinked_buttons": 0,
        "duplicates_resolved": 0,
        "changes": [],
    }

    used_plus = {str(p["plu"]) for p in products if p.get("plu")}

    for src in price_rows:
        if not src["plu"]:
            continue

        exact_plu = by_plu.get(src["plu"], [])
        exact_name = by_name.get(src["norm_name"], [])
        target = None

        matching_plu = [p for p in exact_plu if norm(p["name"]) == src["norm_name"]]
        if matching_plu:
            target = matching_plu[0]
        elif len(exact_name) == 1:
            target = exact_name[0]
        elif exact_plu:
            # If the PLU exists but points at a different description, move the
            # old product aside and create a clean source-of-truth row.
            for old in exact_plu:
                if norm(old["name"]) != src["norm_name"]:
                    new_plu = next_available_plu(con, used_plus)
                    con.execute(
                        "UPDATE products SET plu = ?, barcode = ?, active = 0, updated_at = datetime('now') WHERE id = ?",
                        (new_plu, new_plu, old["id"]),
                    )
                    report["moved_conflicts"] += 1
                    report["changes"].append({"action": "moved_conflict", "old_id": old["id"], "old_name": old["name"], "old_plu": src["plu"], "new_plu": new_plu})
            target = None

        if target:
            old = dict(target)
            con.execute(
                """
                UPDATE products
                SET barcode = ?, plu = ?, name = ?, category_id = ?, price = ?,
                    unit = ?, open_price = ?, active = 1, updated_at = datetime('now')
                WHERE id = ?
                """,
                (src["barcode"], src["plu"], src["name"], src["category_id"], src["price"], src["unit"], src["open_price"], target["id"]),
            )
            report["updated"] += 1
            if old.get("plu") != src["plu"] or old.get("name") != src["name"] or round(float(old.get("price") or 0), 2) != src["price"] or old.get("category_id") != src["category_id"]:
                report["changes"].append({"action": "updated", "id": target["id"], "from": {"plu": old.get("plu"), "name": old.get("name"), "price": old.get("price"), "category_id": old.get("category_id")}, "to": src})
        else:
            pid = f"price-list-{src['plu']}"
            con.execute(
                """
                INSERT OR REPLACE INTO products
                  (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, image_url, updated_at, open_price)
                VALUES
                  (?, ?, ?, ?, ?, ?, 0, ?, 0.10, 0, 0, 1, COALESCE((SELECT image_url FROM products WHERE id = ?), NULL), datetime('now'), ?)
                """,
                (pid, src["barcode"], src["plu"], src["name"], src["category_id"], src["price"], src["unit"], pid, src["open_price"]),
            )
            report["inserted"] += 1
            report["changes"].append({"action": "inserted", "id": pid, "to": src})

        by_plu = {}
        by_name = {}
        products = table_rows(con, "SELECT * FROM products")
        used_plus = {str(p["plu"]) for p in products if p.get("plu")}
        for p in products:
            if p.get("plu"):
                by_plu.setdefault(str(p["plu"]), []).append(p)
            by_name.setdefault(norm(p["name"]), []).append(p)

    # Relink keyboard buttons away from products that were moved inactive when a
    # product with the button label now exists from the price list.
    for btn in table_rows(con, "SELECT id, label, product_id FROM keyboard_buttons WHERE product_id IS NOT NULL AND product_id != ''"):
        linked = table_rows(con, "SELECT id, active, name FROM products WHERE id = ?", (btn["product_id"],))
        if linked and linked[0]["active"]:
            continue
        label_name = clean(str(btn["label"]).replace("\\n", " ")).split("$")[0]
        candidates = table_rows(con, "SELECT id FROM products WHERE active = 1 AND upper(name) = upper(?) LIMIT 1", (label_name,))
        if candidates:
            con.execute("UPDATE keyboard_buttons SET product_id = ?, updated_at = datetime('now') WHERE id = ?", (candidates[0]["id"], btn["id"]))
            report["relinked_buttons"] += 1

    # Resolve any remaining duplicate PLUs by keeping the first keyboard-linked
    # active row, otherwise the first active row, and assigning fresh PLUs to the rest.
    duplicate_plus = table_rows(con, "SELECT plu FROM products WHERE plu IS NOT NULL AND plu != '' GROUP BY plu HAVING COUNT(*) > 1")
    used_plus = {str(row["plu"]) for row in table_rows(con, "SELECT plu FROM products WHERE plu IS NOT NULL AND plu != ''")}
    for dup in duplicate_plus:
        rows = table_rows(con, "SELECT id, plu, name, active FROM products WHERE plu = ? ORDER BY active DESC, name", (dup["plu"],))
        rows.sort(key=lambda p: (0 if p["id"] in keyboard_links and p["active"] else 1, 0 if p["active"] else 1, p["name"]))
        for old in rows[1:]:
            new_plu = next_available_plu(con, used_plus)
            con.execute("UPDATE products SET plu = ?, barcode = ?, updated_at = datetime('now') WHERE id = ?", (new_plu, new_plu, old["id"]))
            report["duplicates_resolved"] += 1
            report["changes"].append({"action": "resolved_duplicate", "id": old["id"], "name": old["name"], "old_plu": dup["plu"], "new_plu": new_plu})

    con.commit()
    final = {
        "products": con.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        "active_products": con.execute("SELECT COUNT(*) FROM products WHERE active = 1").fetchone()[0],
        "duplicate_plus": con.execute("SELECT COUNT(*) FROM (SELECT plu FROM products WHERE plu IS NOT NULL AND plu != '' GROUP BY plu HAVING COUNT(*) > 1)").fetchone()[0],
        "missing_sheet_plus": 0,
    }
    for src in price_rows:
        if src["plu"]:
            exists = con.execute("SELECT 1 FROM products WHERE plu = ? AND active = 1", (src["plu"],)).fetchone()
            if not exists:
                final["missing_sheet_plus"] += 1
    report["final"] = final
    con.close()
    return report


def main():
    if not PRICE_LIST.exists():
        raise SystemExit(f"Missing price list: {PRICE_LIST}")
    price_rows = parse_price_list()
    reports = []
    for db_path in DB_PATHS:
        try:
            reports.append(sync_db(db_path, price_rows))
        except Exception as exc:
            reports.append({"db": str(db_path), "error": str(exc)})

    out_dir = ROOT / "reports"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = out_dir / f"price-list-sync-{stamp}.json"
    csv_path = out_dir / f"price-list-sync-{stamp}.csv"
    json_path.write_text(json.dumps(reports, indent=2), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["db", "action", "id", "old_plu", "new_plu", "old_name", "new_name"])
        writer.writeheader()
        for report in reports:
            for change in report.get("changes", []):
                writer.writerow({
                    "db": report.get("db"),
                    "action": change.get("action"),
                    "id": change.get("id") or change.get("old_id"),
                    "old_plu": change.get("old_plu") or change.get("from", {}).get("plu"),
                    "new_plu": change.get("new_plu") or change.get("to", {}).get("plu"),
                    "old_name": change.get("old_name") or change.get("from", {}).get("name"),
                    "new_name": change.get("to", {}).get("name"),
                })
    print(json.dumps({"price_rows": len(price_rows), "reports": reports, "json": str(json_path), "csv": str(csv_path)}, indent=2))


if __name__ == "__main__":
    main()
