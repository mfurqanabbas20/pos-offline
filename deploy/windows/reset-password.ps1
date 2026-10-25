<#
.SYNOPSIS
  Sets a new password for a POS login (e.g. if the owner forgot it).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\reset-password.ps1
#>
param([string]$Username = '')

. "$PSScriptRoot\common.ps1"
[void](Read-Settings)
Set-BackendEnv

$exists = "import django,os,sys;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings');django.setup();" +
          "from django.contrib.auth import get_user_model as g;" +
          "print(','.join(g().objects.order_by('username').values_list('username', flat=True)))"
Push-Location $BackendDir
$known = ((& $VenvPython -c $exists) | Out-String).Trim().Split(',') | Where-Object { $_ }
Pop-Location

while (-not $Username) { $Username = (Read-Host 'Username to reset').Trim() }
# Check the name before asking for a password, and show the real names if it is wrong.
if ($known -notcontains $Username) { Fail "There is no login called '$Username'. Logins on this PC: $($known -join ', ')" }
$password = $null
while (-not $password) {
    $p1 = Read-Host 'New password (at least 8 characters)' -AsSecureString
    $p2 = Read-Host 'Type it again' -AsSecureString
    $t1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
    $t2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
    if ($t1.Length -lt 8) { Write-Warn 'Too short. Use at least 8 characters.' }
    elseif ($t1 -ne $t2) { Write-Warn 'The two passwords do not match. Try again.' }
    else { $password = $t1 }
}

$env:POS_OWNER_USERNAME = $Username
$env:POS_OWNER_PASSWORD = $password
$code = "import django,os,sys;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings');django.setup();" +
        "from django.contrib.auth import get_user_model as g;" +
        "u=g().objects.filter(username=os.environ['POS_OWNER_USERNAME']).first();" +
        "sys.exit(2) if u is None else (u.set_password(os.environ['POS_OWNER_PASSWORD']), u.save(update_fields=['password']))"
Push-Location $BackendDir
try {
    & $VenvPython -c $code
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:\POS_OWNER_USERNAME, Env:\POS_OWNER_PASSWORD -ErrorAction SilentlyContinue
}
if ($code -ne 0) { Fail 'Could not change the password.' }
Write-Ok "Password changed for '$Username'. Sign in with the new password."
