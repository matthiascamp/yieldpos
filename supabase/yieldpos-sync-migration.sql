-- YieldPOS cloud sync compatibility migration.
-- Run this on an existing Supabase project before enabling cloud sync.
-- If the project was created from the old UUID schema, rebuild from schema.sql
-- before loading real data; YieldPOS product/category/keyboard ids are text ids.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS family TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS open_price BOOLEAN DEFAULT false;
ALTER TABLE keyboard_buttons ADD COLUMN IF NOT EXISTS image_scale NUMERIC(6,2) DEFAULT 100;

CREATE TABLE IF NOT EXISTS keyboard_pages (
  page       INT PRIMARY KEY,
  name       TEXT DEFAULT 'Untitled',
  cols       INT DEFAULT 13,
  rows       INT DEFAULT 7,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE keyboard_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'keyboard_pages'
      AND policyname = 'Authenticated users can read all'
  ) THEN
    CREATE POLICY "Authenticated users can read all" ON keyboard_pages
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'keyboard_pages'
      AND policyname = 'Authenticated users can manage keyboard pages'
  ) THEN
    CREATE POLICY "Authenticated users can manage keyboard pages" ON keyboard_pages
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_plu_unique
  ON products(plu)
  WHERE plu IS NOT NULL AND plu <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products(barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE deal_products;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE keyboard_pages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
