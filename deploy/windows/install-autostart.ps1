<#
.SYNOPSIS
  Makes Tasnim Pharmacy POS start automatically when this Windows user logs in, adds a nightly
  database backup, and puts shortcuts on the desktop. No administrator rights needed.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\install-autostart.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\install-autostart.ps1 -BackupTime 21:30
#>
param([string]$BackupTime = '22:00')

. "$PSScriptRoot\common.ps1"
$s = Read-Settings
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Step 'Starting the POS automatically at login'
$startAction = New-ScheduledTaskAction -Execute $ps `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\start.ps1`""
$startTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$opts = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'Tasnim POS - Start' -Action $startAction -Trigger $startTrigger -Settings $opts `
    -Description 'Starts Tasnim Pharmacy POS and opens it in the browser.' -Force | Out-Null
Write-Ok "Task 'Tasnim POS - Start' runs at login"

Write-Step "Nightly database backup at $BackupTime"
$backupAction = New-ScheduledTaskAction -Execute $ps `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup.ps1`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
$backupOpts = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Tasnim POS - Backup' -Action $backupAction -Trigger $backupTrigger -Settings $backupOpts `
    -Description "Copies the POS database to $BackupDir (keeps 30)." -Force | Out-Null
Write-Ok "Task 'Tasnim POS - Backup' runs daily (missed backups run at next startup)"

Write-Step 'Desktop shortcuts'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$icon = Join-Path $PSScriptRoot 'tasnim.ico'
foreach ($item in @(
    @{ Name = 'Tasnim POS'; Script = 'start.ps1'; Tip = 'Open Tasnim Pharmacy POS' },
    @{ Name = 'Stop Tasnim POS'; Script = 'stop.ps1'; Tip = 'Stop Tasnim Pharmacy POS' }
)) {
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$($item.Name).lnk"))
    $lnk.TargetPath = $ps
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\$($item.Script)`""
    $lnk.WorkingDirectory = $RepoRoot
    $lnk.Description = $item.Tip
    $lnk.WindowStyle = 7   # minimized
    if (Test-Path $icon) { $lnk.IconLocation = $icon }
    $lnk.Save()
}
Write-Ok "Shortcuts added to the desktop: 'Tasnim POS' and 'Stop Tasnim POS'"
