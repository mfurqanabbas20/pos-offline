<#
.SYNOPSIS
  Makes a safe copy of the POS database in C:\ProgramData\TasneemPOS\backups and keeps the last $Keep copies.
  Safe while the POS is running (uses SQLite's online backup, or pg_dump for PostgreSQL).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\backup.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\backup.ps1 -Destination E:\POS-Backups
#>
param(
    [int]$Keep = 30,
    [string]$Destination = ''
)

. "$PSScriptRoot\common.ps1"
$s = Read-Settings
if (-not $Destination) { $Destination = $BackupDir }
Ensure-Dir $Destination
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'

if ($s.database -eq 'sqlite') {
    $target = Join-Path $Destination "pos_$stamp.sqlite3"
    # sqlite3's backup API copies a consistent snapshot even while sales are being written (WAL mode).
    $code = "import sqlite3,sys; src=sqlite3.connect(sys.argv[1]); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()"
    & $VenvPython -c $code $s.sqlitePath $target
    if ($LASTEXITCODE -ne 0) { Fail 'Backup failed.' }
    $pattern = 'pos_*.sqlite3'
} else {
    $pgDump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
    if (-not $pgDump) { Fail 'pg_dump.exe not found on PATH. Add PostgreSQL''s bin folder to PATH.' }
    $pw = (Select-String -Path $EnvFile -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches[0].Groups[1].Value
    $env:PGPASSWORD = $pw
    $target = Join-Path $Destination "pos_$stamp.dump"
    & $pgDump.Source -U postgres -h localhost -F c -f $target pharmacy_pos
    Remove-Item Env:\PGPASSWORD
    if ($LASTEXITCODE -ne 0) { Fail 'Backup failed.' }
    $pattern = 'pos_*.dump'
}

$sizeKb = [math]::Round((Get-Item $target).Length / 1KB)
Write-Ok "Backup saved: $target ($sizeKb KB)"

# Keep only the newest $Keep backups.
Get-ChildItem -Path $Destination -Filter $pattern | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Keep | Remove-Item -Force
