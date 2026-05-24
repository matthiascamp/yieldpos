YieldPOS source package

After pulling on a new PC, run:

npm install
.\register

For admin mode:

.\admin

The source files that make up the app are included in pos/, db/, scripts/, and supabase/.
The bundled database is db/crisp-pos.sqlite, and it is only used to seed a PC that
does not already have a live database.

After first launch, the live SQLite database is the source of truth. Startup does
not re-import bundled product, price, keyboard, staff, deal, or settings data into
an existing live database.
