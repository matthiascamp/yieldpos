YieldPOS source package

After pulling on a new PC, run:

npm install
.\register

For admin mode:

.\admin

The source files that make up the app are included in pos/, db/, scripts/, and supabase/.
The bundled database is db/crisp-pos.sqlite.
Keyboard seed files are db/keyboard-catpages.js, db/keyboard-subpages.js, and keyboard-layout.json.
Product and keyboard images are included under pos/images/.

If a PC already had an older YieldPOS install, Windows may still have an old live
runtime database in %APPDATA%\YieldPOS Client. To replace that old runtime DB
with the bundled DB from this folder, close YieldPOS and run:

.\reset-runtime-db.cmd

The reset script backs up the old runtime DB before replacing it.
