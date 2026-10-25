<#
.SYNOPSIS
  Starts Tasneem Pharmacy POS in production mode (hidden windows) and opens it in the browser.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\start.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\start.ps1 -NoBrowser
#>
param([switch]$NoBrowser)

. "$PSScriptRoot\common.ps1"
$s = Read-Settings
$appUrl = "http://localhost:$($s.frontendPort)"
$healthUrl = "http://127.0.0.1:$($s.backendPort)/api/health/"

foreach ($d in @($LogDir, $RunDir)) { Ensure-Dir $d }

# Already running? Just open the app.
if ((Test-PortInUse $s.backendPort) -and (Test-PortInUse $s.frontendPort) -and (Wait-Http $healthUrl 3)) {
    Write-Ok 'Tasneem POS is already running.'
    if (-not $NoBrowser) { Start-Process $appUrl }
    exit 0
}
foreach ($port in @($s.backendPort, $s.frontendPort)) {
    if (Test-PortInUse $port) { Fail "Port $port is used by another program. Close it (or run Stop Tasneem POS) and try again." }
}
if (-not (Test-Path (Join-Path $FrontendDir '.next\BUILD_ID'))) { Fail 'The app has not been built. Run setup first.' }

Set-BackendEnv
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

# Keep a month of launcher logs.
Get-ChildItem -Path $LogDir -Filter '*-*.log' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force -ErrorAction SilentlyContinue

# Apply any pending database updates (after an app update) before serving.
Write-Step 'Checking the database'
Invoke-Checked $VenvPython @('manage.py', 'migrate', '--noinput', '--verbosity', '0') $BackendDir
Write-Ok 'Database up to date'

Write-Step 'Starting the server'
# Waitress: production WSGI server that runs natively on Windows. 'localhost' = this PC only (IPv4 + IPv6).
$backend = Start-Process -FilePath $Waitress -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru `
    -ArgumentList @("--listen=localhost:$($s.backendPort)", '--threads=8', '--channel-timeout=120', 'config.wsgi:application') `
    -RedirectStandardOutput (Join-Path $LogDir "backend-$stamp.out.log") `
    -RedirectStandardError (Join-Path $LogDir "backend-$stamp.err.log")
Set-Content -Path (Join-Path $RunDir 'backend.pid') -Value $backend.Id

$env:NODE_ENV = 'production'
$env:NEXT_TELEMETRY_DISABLED = '1'
$nextBin = Join-Path $FrontendDir 'node_modules\next\dist\bin\next'
$frontend = Start-Process -FilePath 'node.exe' -WorkingDirectory $FrontendDir -WindowStyle Hidden -PassThru `
    -ArgumentList @("`"$nextBin`"", 'start', '-p', "$($s.frontendPort)", '-H', '127.0.0.1') `
    -RedirectStandardOutput (Join-Path $LogDir "frontend-$stamp.out.log") `
    -RedirectStandardError (Join-Path $LogDir "frontend-$stamp.err.log")
Set-Content -Path (Join-Path $RunDir 'frontend.pid') -Value $frontend.Id

if (-not (Wait-Http $healthUrl 60)) { Fail "The server did not start. See logs in $LogDir" }
Write-Ok "Server running (port $($s.backendPort))"
if (-not (Wait-Http "http://127.0.0.1:$($s.frontendPort)/login" 60)) { Fail "The app screens did not start. See logs in $LogDir" }
Write-Ok "App running at $appUrl"

if (-not $NoBrowser) { Start-Process $appUrl }
