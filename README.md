# YieldPOS Client

YieldPOS is an Electron point-of-sale app with a bundled SQLite seed database,
keyboard layouts, product data, and local product images.

## Fresh Pull Setup

```powershell
git clone https://github.com/matthiascamp/yieldpos.git
cd yieldpos
npm install
.\register
```

For the admin app:

```powershell
.\admin
```

Dev mode launchers are also available:

```powershell
.\dev-register
.\dev-admin
```

## Bundled Data

The repository includes the files needed for a fresh work PC:

- `db/crisp-pos.sqlite` is the bundled seed database.
- `db/keyboard-catpages.js` and `db/keyboard-subpages.js` seed the keyboard pages.
- `keyboard-layout.json` and `products.json` are included for import/migration support.
- `pos/images/` contains the local product and keyboard images.

On first launch, the app copies/loads the bundled database into Electron's user
data folder. Existing local databases are preserved, and missing bundled
products/keyboard data are merged in by the startup migrations.

If a PC already has an older local runtime database, Windows may keep using:

```powershell
$env:APPDATA\YieldPOS Client\crisp-pos.sqlite
```

To force that PC back to the bundled database from this folder, close YieldPOS
and run:

```powershell
.\reset-runtime-db.cmd
```

The script backs up the old runtime DB before replacing it.

## Building

```powershell
npm run build:portable
```

Generated installers and launchers are intentionally ignored by Git. Rebuild
them locally after pulling instead of committing them.
