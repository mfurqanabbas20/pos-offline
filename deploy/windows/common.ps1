# Shared helpers for the Tasnim Pharmacy POS Windows scripts. Dot-source this file:  . "$PSScriptRoot\common.ps1"
# Windows PowerShell 5.1 compatible. Keep this file ASCII-only (5.1 reads BOM-less files as ANSI).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on 5.1

$RepoRoot    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BackendDir  = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$VenvPython  = Join-Path $BackendDir 'venv\Scripts\python.exe'
$Waitress    = Join-Path $BackendDir 'venv\Scripts\waitress-serve.exe'
$EnvFile     = Join-Path $BackendDir '.env.production'

# Pharmacy data lives outside the app folder so updating or replacing the app never touches it.
# POS_DATA_ROOT can point somewhere else (e.g. a second drive, or a test folder).
$DataRoot     = if ($env:POS_DATA_ROOT) { $env:POS_DATA_ROOT } else { Join-Path $env:ProgramData 'TasnimPOS' }
$DataDir      = Join-Path $DataRoot 'data'
$LogDir       = Join-Path $DataRoot 'logs'
$RunDir       = Join-Path $DataRoot 'run'
$BackupDir    = Join-Path $DataRoot 'backups'
$SettingsFile = Join-Path $DataRoot 'settings.json'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "    [ok] $Message" -ForegroundColor Green }
function Write-Note([string]$Message) { Write-Host "    $Message" -ForegroundColor Gray }
function Write-Warn([string]$Message) { Write-Host "    [!] $Message" -ForegroundColor Yellow }

function Fail([string]$Message) {
    Write-Host "`n[x] $Message" -ForegroundColor Red
    exit 1
}

function Ensure-Dir([string]$Path) {
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

function Read-Settings {
    if (-not (Test-Path $SettingsFile)) {
        Fail "Not set up yet. Run 'Setup Tasnim POS.cmd' (deploy\windows\setup.ps1) first."
    }
    return Get-Content $SettingsFile -Raw | ConvertFrom-Json
}

function Test-PortInUse([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

# Polls a URL until it answers 2xx, or gives up after $TimeoutSeconds.
function Wait-Http([string]$Url, [int]$TimeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# Runs a native command in a directory and fails loudly if it returns non-zero.
function Invoke-Checked([string]$Exe, [string[]]$Arguments, [string]$WorkDir) {
    Push-Location $WorkDir
    try {
        & $Exe @Arguments
        if ($LASTEXITCODE -ne 0) { Fail "'$Exe $($Arguments -join ' ')' failed (exit code $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

# Environment for every backend command: production settings, logs in ProgramData.
function Set-BackendEnv {
    $env:POS_ENV_FILE = $EnvFile
    $env:LOG_DIR = $LogDir
    $env:PYTHONUTF8 = '1'
}
