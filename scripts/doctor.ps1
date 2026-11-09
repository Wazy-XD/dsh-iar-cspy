#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose the dsh-iar-cspy installation.

.DESCRIPTION
    Reads config.json, checks the IAR Embedded Workbench root, the private virtual
    environment and the official iar-cspy / iar-cspy-mcp packages. The temp directory
    used by CSpyServer2 is verified with a write/delete probe.

    With -Probe the script also starts and stops a managed CSpyServer2 through
    "iar_cspy_mcp --probe-cspyserver2".

    Note: the DSH plugin configuration (Plugins page -> dsh-iar-cspy -> Configure)
    overrides config.json. config.json is only the auto-detection fallback.

.PARAMETER IarPath
    Override the IAR root recorded in config.json for this run.

.PARAMETER Probe
    Also run the CSpyServer2 probe with TEMP/TMP pointed at tempDir.

.EXAMPLE
    .\doctor.ps1

.EXAMPLE
    .\doctor.ps1 -IarPath 'D:\iar\ewarm-9.60.2' -Probe
#>
[CmdletBinding()]
param(
    [string]$IarPath,
    [switch]$Probe
)

$ErrorActionPreference = 'Continue'

function ConvertTo-CleanPath {
    param([string]$Value)
    if (-not $Value) { return '' }
    return $Value.Trim().Trim('"')
}

function Get-StateRoot {
    if ($env:DSH_IAR_CSPY_HOME) {
        return [IO.Path]::GetFullPath($env:DSH_IAR_CSPY_HOME)
    }
    if ($env:LOCALAPPDATA) {
        return [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'dsh-iar-cspy'))
    }
    if ($env:USERPROFILE) {
        return [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'AppData\Local\dsh-iar-cspy'))
    }
    return [IO.Path]::GetFullPath((Join-Path $HOME '.dsh-iar-cspy'))
}

function Check {
    param(
        [string]$Label,
        [bool]$Ok,
        [string]$Detail = ''
    )
    $suffix = ''
    if ($Detail) { $suffix = " - $Detail" }
    if ($Ok) {
        Write-Host ("  [ok  ] {0}{1}" -f $Label, $suffix)
        return
    }
    $script:problems++
    Write-Host ("  [FAIL] {0}{1}" -f $Label, $suffix) -ForegroundColor Yellow
}

$problems = 0
$stateRoot = Get-StateRoot
$configPath = Join-Path $stateRoot 'config.json'
$venvPythonFallback = Join-Path (Join-Path $stateRoot 'venv') 'Scripts\python.exe'

Write-Host 'dsh-iar-cspy doctor' -ForegroundColor Cyan
Write-Host "  state:  $stateRoot"
Write-Host "  config: $configPath"
Write-Host ''

$config = $null
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    try {
        $config = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop | ConvertFrom-Json
        Check 'config.json parses' $true
    } catch {
        Check 'config.json parses' $false $_.Exception.Message
    }
} else {
    Check 'config.json exists' $false "$configPath not found; run scripts\setup.ps1"
}

# --- IAR installation -------------------------------------------------------------------

$recordedIar = ''
if ($null -ne $config -and $config.iarPath) { $recordedIar = [string]$config.iarPath }

$effectiveIar = $recordedIar
if ($IarPath) {
    $effectiveIar = ConvertTo-CleanPath $IarPath
    Write-Host "  -IarPath override: $effectiveIar"
}
if ($effectiveIar -and (Test-Path -LiteralPath $effectiveIar -PathType Container)) {
    $effectiveIar = (Get-Item -LiteralPath $effectiveIar).FullName
}

if (-not $effectiveIar) {
    Check 'iarPath' $false 'missing from config.json; run setup.ps1 or pass -IarPath'
} else {
    Check 'iarPath' $true $effectiveIar
    Check 'iarPath exists' (Test-Path -LiteralPath $effectiveIar -PathType Container) $effectiveIar
    $serverExe = Join-Path $effectiveIar 'common\bin\CSpyServer2.exe'
    $launcherExe = Join-Path $effectiveIar 'common\bin\IarServiceLauncher.exe'
    Check 'common\bin\CSpyServer2.exe' (Test-Path -LiteralPath $serverExe -PathType Leaf) $serverExe
    Check 'common\bin\IarServiceLauncher.exe' (Test-Path -LiteralPath $launcherExe -PathType Leaf) $launcherExe
}

# --- Python interpreter -----------------------------------------------------------------

$recordedPython = ''
if ($null -ne $config -and $config.mcpPython) { $recordedPython = [string]$config.mcpPython }

$python = $recordedPython
if ($python) {
    Check 'mcpPython recorded' $true $python
} else {
    $python = $venvPythonFallback
    if (Test-Path -LiteralPath $python -PathType Leaf) {
        Check 'mcpPython recorded' $false "missing from config.json; using fallback $python"
    } else {
        Check 'mcpPython recorded' $false 'missing from config.json; run setup.ps1'
    }
}

$pythonExists = $false
if ($python) {
    $pythonExists = Test-Path -LiteralPath $python -PathType Leaf
    Check 'mcpPython exists' $pythonExists $python
} else {
    Check 'mcpPython exists' $false 'no mcpPython configured and no venv python found'
}

if ($pythonExists) {
    $versionArgs = @('-c', "import sys; print('%d.%d.%d' % sys.version_info[:3])")
    $versionOutput = & $python @versionArgs 2>&1
    $versionExit = $LASTEXITCODE
    $versionText = ((@($versionOutput) | ForEach-Object { "$_" }) -join ' ').Trim()
    Check 'mcpPython runs' ($versionExit -eq 0) $versionText

    if ($versionExit -eq 0) {
        $importArgs = @('-c', "import iar_cspy, iar_cspy_mcp; print('iar-cspy ok')")
        $importOutput = & $python @importArgs 2>&1
        $importExit = $LASTEXITCODE
        $importText = ((@($importOutput) | ForEach-Object { "$_" }) -join ' ').Trim()
        if ($importExit -eq 0) { $importText = 'iar-cspy ok' }
        Check 'import iar_cspy, iar_cspy_mcp' ($importExit -eq 0) $importText
    }
}

# --- temp directory ---------------------------------------------------------------------

$recordedTemp = ''
if ($null -ne $config -and $config.tempDir) { $recordedTemp = [string]$config.tempDir }
$tempDir = $recordedTemp
if ($tempDir) {
    Check 'tempDir recorded' $true $tempDir
} else {
    $tempDir = Join-Path $stateRoot 'tmp'
    Check 'tempDir recorded' $false "missing from config.json; checking $tempDir"
}
if (Test-Path -LiteralPath $tempDir -PathType Container) {
    Check 'tempDir exists' $true $tempDir
    $probeFile = Join-Path $tempDir ('.dsh-iar-cspy-doctor-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $writeOk = $false
    $writeDetail = ''
    try {
        Set-Content -LiteralPath $probeFile -Value 'ok' -Encoding ASCII -ErrorAction Stop
        Remove-Item -LiteralPath $probeFile -Force -ErrorAction Stop
        $writeOk = -not (Test-Path -LiteralPath $probeFile)
        if (-not $writeOk) { $writeDetail = 'the probe file could not be deleted' }
    } catch {
        $writeDetail = $_.Exception.Message
        if (Test-Path -LiteralPath $probeFile) {
            Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
        }
    }
    Check 'tempDir writable' $writeOk $writeDetail
} else {
    Check 'tempDir exists' $false $tempDir
}

# --- installed packages -----------------------------------------------------------------

if ($pythonExists) {
    Write-Host '  installed packages:' -ForegroundColor Cyan
    $showOutput = @()
    try {
        $showOutput = @(& $python -m pip show iar-cspy iar-cspy-mcp 2>$null)
    } catch {
        $showOutput = @()
    }
    foreach ($match in @($showOutput | Select-String -Pattern '^(Name|Version):')) {
        Write-Host ('    ' + $match.Line)
    }
    $installedNames = @()
    foreach ($match in @($showOutput | Select-String -Pattern '^Name:\s*(.+)$')) {
        $installedNames += $match.Matches[0].Groups[1].Value.Trim()
    }
    Check 'iar-cspy installed' ($installedNames -contains 'iar-cspy')
    Check 'iar-cspy-mcp installed' ($installedNames -contains 'iar-cspy-mcp')
}

# --- optional managed backend probe -----------------------------------------------------

if ($Probe) {
    $serverInstalled = $false
    if ($effectiveIar) {
        $serverInstalled = Test-Path -LiteralPath (Join-Path $effectiveIar 'common\bin\CSpyServer2.exe') -PathType Leaf
    }
    if (-not $pythonExists) {
        Write-Host '  probe skipped: mcpPython is not available.' -ForegroundColor Yellow
    } elseif (-not $serverInstalled) {
        Write-Host '  probe skipped: no valid IAR root (common\bin\CSpyServer2.exe missing).' -ForegroundColor Yellow
    } elseif (-not $tempDir) {
        Write-Host '  probe skipped: no tempDir resolved.' -ForegroundColor Yellow
    } else {
        Write-Host '  CSpyServer2 probe:' -ForegroundColor Cyan
        $savedTemp = $env:TEMP
        $savedTmp = $env:TMP
        $probeExit = -1
        try {
            $env:TEMP = $tempDir
            $env:TMP = $tempDir
            $probeArgs = @('-m', 'iar_cspy_mcp', '--iar-path', $effectiveIar, '--probe-cspyserver2')
            & $python @probeArgs
            $probeExit = $LASTEXITCODE
        } catch {
            Write-Host ('    ' + $_.Exception.Message) -ForegroundColor Yellow
        } finally {
            $env:TEMP = $savedTemp
            $env:TMP = $savedTmp
        }
        Write-Host ("    exit code: {0}" -f $probeExit)
        Check 'probe-cspyserver2' ($probeExit -eq 0)
    }
}

Write-Host ''
Write-Host 'Plugin configuration' -ForegroundColor Cyan
Write-Host '  The DSH plugin configuration (Plugins page -> dsh-iar-cspy -> Configure) overrides'
Write-Host '  config.json. config.json is only the auto-detection fallback: if iarPath, mcpPython'
Write-Host '  or tempDir are set there, these checks describe the fallback, not the running plugin.'
Write-Host ''

if ($problems -eq 0) {
    Write-Host 'All checks passed.' -ForegroundColor Green
    exit 0
}

Write-Host ("{0} check(s) failed. Run setup.ps1 again, pass -IarPath, or fix the DSH plugin configuration." -f $problems) -ForegroundColor Yellow
exit 1
