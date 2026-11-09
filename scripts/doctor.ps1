#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose the dsh-iar-cspy installation.

.DESCRIPTION
    Checks the private virtual environment, the official IAR packages, the IAR
    installation recorded in config.json and the temp directory the debugger
    backend needs. With -Probe it also starts and stops a managed CSpyServer2.

.EXAMPLE
    .\doctor.ps1

.EXAMPLE
    .\doctor.ps1 -Probe
#>
[CmdletBinding()]
param(
    [string]$IarPath,
    [switch]$Probe
)

$ErrorActionPreference = 'Continue'
$stateRoot = if ($env:DSH_IAR_CSPY_HOME) { $env:DSH_IAR_CSPY_HOME } else { Join-Path $env:LOCALAPPDATA 'dsh-iar-cspy' }
$venvPython = Join-Path $stateRoot 'venv\Scripts\python.exe'
$configPath = Join-Path $stateRoot 'config.json'
$problems = 0

function Check([string]$Label, [bool]$Ok, [string]$Detail = '') {
    $status = if ($Ok) { 'ok  ' } else { 'FAIL' }
    Write-Host ("  [{0}] {1}{2}" -f $status, $Label, $(if ($Detail) { " - $Detail" } else { '' }))
    if (-not $Ok) { $script:problems++ }
}

Write-Host "dsh-iar-cspy doctor" -ForegroundColor Cyan
Write-Host "  state: $stateRoot"

Check 'config.json' (Test-Path $configPath) $configPath
Check 'virtual environment' (Test-Path $venvPython) $venvPython

if (Test-Path $configPath) {
    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        $recorded = $config.iarPath
        if ($IarPath) { $recorded = $IarPath }
        Check 'iarPath recorded' ([bool]$recorded) $recorded
        if ($recorded) {
            Check 'CSpyServer2.exe' (Test-Path (Join-Path $recorded 'common\bin\CSpyServer2.exe'))
            Check 'IarServiceLauncher.exe' (Test-Path (Join-Path $recorded 'common\bin\IarServiceLauncher.exe'))
        }
        Check 'tempDir recorded' ([bool]$config.tempDir) $config.tempDir
    } catch {
        Check 'config.json parses' $false $_.Exception.Message
    }
}

if (Test-Path $venvPython) {
    Write-Host '  launcher self-check:' -ForegroundColor Cyan
    & $venvPython -m dsh_iar_launcher --doctor
    Check 'launcher --doctor' ($LASTEXITCODE -eq 0)

    Write-Host '  installed packages:' -ForegroundColor Cyan
    & $venvPython -m pip show iar-cspy iar-cspy-mcp dsh-iar-launcher 2>$null |
        Select-String -Pattern '^(Name|Version):' |
        ForEach-Object { Write-Host ("    " + $_.Line) }
}

if ($Probe -and (Test-Path $venvPython)) {
    Write-Host '  managed backend probe:' -ForegroundColor Cyan
    & $venvPython -m dsh_iar_launcher --probe-cspyserver2
    Check 'probe-cspyserver2' ($LASTEXITCODE -eq 0)
}

Write-Host ''
if ($problems -eq 0) {
    Write-Host 'All checks passed.' -ForegroundColor Green
    exit 0
}
Write-Host "$problems check(s) failed. Re-run setup.ps1, or pass -IarPath to doctor.ps1." -ForegroundColor Yellow
exit 1
