<#
.SYNOPSIS
  Removes the auto-start and nightly-backup tasks and the desktop shortcuts. Data is not touched.
#>
. "$PSScriptRoot\common.ps1"

foreach ($task in @('Tasneem POS - Start', 'Tasneem POS - Backup')) {
    if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $task -Confirm:$false
        Write-Ok "Removed task '$task'"
    }
}
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($name in @('Tasneem POS', 'Stop Tasneem POS')) {
    $lnk = Join-Path $desktop "$name.lnk"
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Ok "Removed shortcut '$name'" }
}
Write-Note "Your data in $DataRoot was not changed."
