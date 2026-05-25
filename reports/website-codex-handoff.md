# Crisp Website Supabase Pricing Handoff

Generated from the current YieldPOS local SQLite database after repairing active lookup-code collisions and pushing the cleaned database to Supabase.

## Files

- `reports/website-live-lookup-map.json`: structured lookup map for code use.
- `reports/website-live-lookup-map.csv`: same mapping in spreadsheet-friendly form.
- `reports/website-live-lookup-map.md`: audit summary and all non-safe rows.

## Website Implementation Rules

1. Do not use `top_products.pcode` as a Supabase lookup key. It is audit/reference context only.
2. Use `suggested_lookup_code` from `website-live-lookup-map.json` to query Supabase `products.plu` or `products.barcode`.
3. For Fruit/Veg category pages, prefer the map over raw `products.json.barcode` whenever a product name exists in the map.
4. For homepage, top-sellers, and search rows from `top_products.json`, normalize the product name the same way the site already does for display matching, then resolve it through the `top_products` section of the map.
5. If a map row is `safe`, it can be used directly.
6. If a row is `review_recommended`, it probably maps correctly but should be visually checked once before showing live pricing.
7. If a row is `manual_review`, do not use the candidate code automatically and do not show a stale/static price. Show `Unavailable`, `Market price`, or hide the price until the mapping is confirmed.
8. If Supabase returns more than one active row for a lookup code, treat that as an error/unavailable. The current database has been cleaned so this should not happen.
9. If `open_price = 1` or the live price is `0`, do not display `$0.00`; show `Market price` or `Ask in store`.
10. Deals must also come from Supabase only: query active `deals`, join through `deal_products`, and fetch product names/prices from `products`. Do not hardcode deal pricing.

## Current Mapping Summary

- Safe rows: 419
- Review recommended: 2
- Manual review: 5
- Top-products rows needing review: 4
- Fruit/Veg category rows needing review: 3

## Top Products Needing Review

| Website product | Use code | Review candidate | Matched YieldPOS product | Status |
| --- | --- | --- | --- | --- |
| AEGEAN NATURAL AUST ALMONDS |  | 9317616187522 | AEGEAN NATURAL AUST ALMONDS 500G | manual_review |
| ASIAN VEGETABLES ASST EA |  | 20044 | Asian Vege | manual_review |
| AUSTRALIAN D/ROAST ALMONDS |  | 9315054009239 | AUSTRALIAN D/ROAST ALMONDS 150G | manual_review |
| FETTA |  | 9322515012417 | FETTA PERSIAN | manual_review |

## Fruit/Veg Rows Needing Review

| Website product | Use code | Review candidate | Matched YieldPOS product | Status |
| --- | --- | --- | --- | --- |
| POTATOES DUTCH KG | 2534 | 2534 | Dutch Cream Potatoes | review_recommended |
| SQUASH GOLD KG |  | 1882 | Gold | manual_review |
| TOMATOES GRAPE RED 250G | 9359918000000 | 9359918000000 | GRAPE TOMATOES 250G | review_recommended |
