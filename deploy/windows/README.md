# Installing Tasnim Pharmacy POS on a Windows PC

This sets the POS up to run **in production mode on one Windows PC** (Windows 10 or 11): optimized app screens, a production web server, and no developer tools or warnings. It works without internet once installed.

## 1. Install the two prerequisites (one time)

| Program | Version | Download |
| --- | --- | --- |
| Python | 3.12 or newer | https://www.python.org/downloads/ (tick **"Add python.exe to PATH"** in the installer) |
| Node.js | 20.9 or newer (LTS) | https://nodejs.org/ |

## 2. Copy the app and run setup

1. Copy the whole `POS-Offline` folder to the PC, for example `C:\TasnimPOS`.
2. Double-click **`Setup Tasnim POS.cmd`**.
3. When asked, choose the **owner username and password** you will sign in with.
4. Wait for **"Setup complete."** (the first run downloads packages and takes a few minutes).

To also start the POS automatically at login, add a nightly backup and put shortcuts on the desktop, run this once afterwards:

```
powershell -ExecutionPolicy Bypass -File deploy\windows\install-autostart.ps1
```

## 3. Daily use

| To… | Do this |
| --- | --- |
| Open the POS | Desktop shortcut **Tasnim POS** (or `Start Tasnim POS.cmd`). It opens http://localhost:3000 |
| Stop it | **Stop Tasnim POS** shortcut (or `Stop Tasnim POS.cmd`) |
| Back up now | `Backup Tasnim POS.cmd` |

If the POS is already running, the Tasnim POS shortcut just opens the browser.

## Where things are

Everything that matters for the pharmacy is kept **outside the app folder**, so updating or replacing the app never touches it:

| What | Where |
| --- | --- |
| Database (all medicines, stock, sales) | `C:\ProgramData\TasnimPOS\data\pos.sqlite3` |
| Backups (newest 30 kept, nightly at 22:00) | `C:\ProgramData\TasnimPOS\backups\` |
| Logs | `C:\ProgramData\TasnimPOS\logs\` |
| Production settings (secret key, ports) | `backend\.env.production` (created by setup; not in git) |

**Copy the backups folder to a USB drive or cloud folder regularly.** A backup on the same PC does not protect against a dead hard disk. To back up straight to another drive: `Backup Tasnim POS.cmd -Destination E:\POS-Backups`.

### Restoring a backup

1. Stop the POS.
2. Copy the chosen `pos_YYYY-MM-DD_HHMM.sqlite3` from the backups folder over `C:\ProgramData\TasnimPOS\data\pos.sqlite3`.
3. Start the POS.

## Updating the app

1. Stop the POS.
2. Replace the app folder with the new version (your data is not in it).
3. Double-click **`Setup Tasnim POS.cmd`** again. It keeps your settings, secret key and database, installs anything new, applies database updates and rebuilds the screens.

## Setup options

```
deploy\windows\setup.ps1 [-PharmacyName "Tasnim Pharmacy"] [-TimeZone "Asia/Karachi"]
                         [-BackendPort 8000] [-FrontendPort 3000] [-Database sqlite|postgres]
                         [-InstallAutostart] [-SkipBuild] [-OwnerUsername x -OwnerPassword y]
```

- **SQLite (default)** needs nothing extra and suits a single-PC shop. It runs in WAL mode with immediate transactions, so two sales saving at the same moment queue instead of failing.
- **PostgreSQL**: pass `-Database postgres`. Setup asks for the `postgres` user's password; create the database first with `createdb pharmacy_pos`. Backups then use `pg_dump`, which must be on PATH.
- **Changing ports** requires running setup again, because the address of the server is built into the app screens.
- `POS_DATA_ROOT` (environment variable) moves the data folder elsewhere, e.g. to a second drive.

## How it runs (for technicians)

| Part | Production setup |
| --- | --- |
| API | Django with `DEBUG=false`, served by **Waitress** (a production WSGI server that runs natively on Windows) on `localhost:8000`. Static admin files via WhiteNoise. |
| Screens | `next build` output served by `next start` on `127.0.0.1:3000`, `NODE_ENV=production`, telemetry off, no `X-Powered-By` header. |
| Network | Both listen on this PC only. Other computers on the network cannot reach the POS. |
| Auto-start | Windows Task Scheduler tasks *Tasnim POS - Start* (at login) and *Tasnim POS - Backup* (daily). Remove them with `uninstall-autostart.ps1`. No administrator rights needed. |
| Checks | `manage.py check --deploy` passes. The four HTTPS-only warnings are acknowledged in settings because the app is served over plain HTTP to `localhost`; set `POS_LOCAL_HTTP=false` when putting it behind HTTPS. |
| Health | `http://localhost:8000/api/health/` returns `{"status": "ok"}` when the API and database are up. |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Port 3000/8000 is used by another program" | Run **Stop Tasnim POS**, or restart the PC. |
| Browser shows "This site can't be reached" | Start the POS; wait about 10 seconds after login for auto-start. |
| "The server did not start" | Look at the newest `backend-*.err.log` in `C:\ProgramData\TasnimPOS\logs`. |
| Forgot a password | Run `powershell -ExecutionPolicy Bypass -File deploy\windows\reset-password.ps1` and follow the prompts. |
| Windows blocks the `.cmd` file ("Windows protected your PC") | Click **More info → Run anyway**. It only runs the scripts in `deploy\windows`. |
