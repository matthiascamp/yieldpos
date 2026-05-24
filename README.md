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

## Database Source Of Truth

The repository includes the files needed for a fresh work PC:

- `db/crisp-pos.sqlite` is the bundled seed database.
- `pos/images/` contains the local product and keyboard images.

On first launch, the app seeds one writable SQLite database for that PC. After
that, the live SQLite database is authoritative. Startup does not pull catalog,
price, keyboard, staff, deal, or settings content from bundled package files into
an existing live database.

If a PC already has an older local runtime database, Windows may keep using:

```powershell
$env:APPDATA\YieldPOS Client\crisp-pos.sqlite
```

To force that PC back to the bundled database from this folder, close YieldPOS
and run:

```powershell
.\reset-runtime-db.cmd
```

Only use the reset script when you intentionally want to throw away the current
live database and replace it from the bundled seed. The script backs up the old
database before replacing it.

## Building

```powershell
npm run build:portable
```

Generated installers and launchers are intentionally ignored by Git. Rebuild
them locally after pulling instead of committing them.
