<#
.SYNOPSIS
  Stops Tasnim Pharmacy POS (both the server and the app screens).
#>
. "$PSScriptRoot\common.ps1"
$s = Read-Settings

function Stop-Tree([int]$ProcessId) {
    # /T also stops child processes (the venv launcher starts a child python.exe).
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

$stopped = 0
foreach ($name in @('backend', 'frontend')) {
    $pidFile = Join-Path $RunDir "$name.pid"
    if (Test-Path $pidFile) {
        $procId = [int](Get-Content $pidFile)
        if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { Stop-Tree $procId; $stopped++ }
        Remove-Item $pidFile -Force
    }
}

# Anything still holding our ports (e.g. started by an older run) - stop only python/node owners.
foreach ($port in @($s.backendPort, $s.frontendPort)) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($o in $owners) {
        $p = Get-Process -Id $o -ErrorAction SilentlyContinue
        if ($p -and ($p.ProcessName -in @('python', 'node', 'waitress-serve'))) { Stop-Tree $o; $stopped++ }
    }
}

if ($stopped -gt 0) { Write-Ok 'Tasnim POS stopped.' } else { Write-Ok 'Tasnim POS was not running.' }
