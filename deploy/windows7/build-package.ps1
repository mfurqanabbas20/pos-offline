<#
.SYNOPSIS
  Builds the Windows 7 package of Tasneem Pharmacy POS on a modern Windows PC (this one).

.DESCRIPTION
  The pharmacy's Windows 7 PC cannot run Node.js 20, so the app screens are pre-built here as plain
  files and served by the backend there. Python packages are downloaded here too, so setup on the
  pharmacy PC works without internet.

  Output: dist\TasneemPOS-Win7.zip (copy the zip to the pharmacy PC). The package is assembled in
  dist\_build, so an install someone made from an earlier dist\TasneemPOS-Win7 folder is never touched.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows7\build-package.ps1
#>
param([string]$PharmacyName = 'Tasneem Pharmacy')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Here = $PSScriptRoot
$Repo = (Resolve-Path (Join-Path $Here '..\..')).Path
$Backend = Join-Path $Repo 'backend'
$Frontend = Join-Path $Repo 'frontend'
$Dist = Join-Path $Repo 'dist'
$Staging = Join-Path $Dist '_build'
$Pkg = Join-Path $Staging 'TasneemPOS-Win7'
$DevPython = Join-Path $Backend 'venv\Scripts\python.exe'

function Step([string]$m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "    [ok] $m" -ForegroundColor Green }
function Run([string]$exe, [string[]]$a, [string]$dir) {
    Push-Location $dir
    try { & $exe @a; if ($LASTEXITCODE -ne 0) { throw "'$exe $($a -join ' ')' failed ($LASTEXITCODE)" } } finally { Pop-Location }
}

if (-not (Test-Path $DevPython)) { throw 'backend\venv is missing on this PC. Create it first (see the main README).' }

Step 'Building the app screens as plain files (static export)'
$env:POS_STATIC_EXPORT = '1'
$env:NEXT_PUBLIC_API_URL = '/api'            # same server as the screens
$env:NEXT_PUBLIC_PHARMACY_NAME = $PharmacyName
$env:NEXT_PUBLIC_CURRENCY = 'PKR'
$env:NEXT_PUBLIC_LOCALE = 'en-PK'
$env:NEXT_TELEMETRY_DISABLED = '1'
try {
    Run 'npm.cmd' @('run', 'build') $Frontend
} finally {
    Remove-Item Env:\POS_STATIC_EXPORT, Env:\NEXT_PUBLIC_API_URL, Env:\NEXT_PUBLIC_PHARMACY_NAME, Env:\NEXT_PUBLIC_CURRENCY, Env:\NEXT_PUBLIC_LOCALE -ErrorAction SilentlyContinue
}
Ok 'Screens built (frontend\out)'
# Work around a Next.js export bug on Windows: prefetch files land in nested folders instead of the
# flat dotted names the browser requests (causes 404s on every page). See fix_export.py.
Run $DevPython @((Join-Path $Here 'fix_export.py'), (Join-Path $Frontend 'out')) $Repo

Step 'Assembling the package'
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Force -Path (Join-Path $Pkg 'app') | Out-Null

# Backend source only: no virtualenv, databases, secrets, caches or collected static files.
& robocopy.exe $Backend (Join-Path $Pkg 'app\backend') /E /NFL /NDL /NJH /NJS /NP `
    /XD venv .venv __pycache__ staticfiles media `
    /XF *.sqlite3 *.sqlite3-wal *.sqlite3-shm .env .env.* *.pyc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying the backend failed (robocopy $LASTEXITCODE)" }
Copy-Item (Join-Path $Backend '.env.example') (Join-Path $Pkg 'app\backend\.env.example')
Copy-Item -Recurse (Join-Path $Frontend 'out') (Join-Path $Pkg 'app\frontend')
foreach ($f in @('pos.py', 'Setup.cmd', 'Start Tasneem POS.cmd', 'Stop Tasneem POS.cmd', 'Backup now.cmd', 'Reset password.cmd')) {
    Copy-Item (Join-Path $Here $f) (Join-Path $Pkg $f)
}
Copy-Item (Join-Path $Here 'README.md') (Join-Path $Pkg 'README.txt')
Copy-Item (Join-Path $Repo 'deploy\windows\tasneem.ico') (Join-Path $Pkg 'tasneem.ico')
Ok 'Files copied'

Step 'Downloading Python packages for offline install (Windows 64-bit, Python 3.12)'
Run $DevPython @('-m', 'pip', 'download', '--disable-pip-version-check', '--quiet',
    '-r', (Join-Path $Backend 'requirements.txt'), '-d', (Join-Path $Pkg 'app\wheels'),
    '--only-binary=:all:', '--platform', 'win_amd64', '--python-version', '3.12', '--implementation', 'cp') $Repo
Ok "$((Get-ChildItem (Join-Path $Pkg 'app\wheels')).Count) packages"

Step 'Zipping'
$zip = Join-Path $Dist 'TasneemPOS-Win7.zip'
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $Pkg -DestinationPath $zip
Remove-Item -Recurse -Force $Staging
Ok "$zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"

Write-Host "`nDone. Copy TasneemPOS-Win7.zip to the pharmacy PC and follow README.txt inside it." -ForegroundColor Green
Write-Host "Note: this replaced frontend\.next with the export build. Run 'npm run build' in frontend before 'npm start' on this PC."
