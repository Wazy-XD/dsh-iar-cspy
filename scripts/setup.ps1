#Requires -Version 5.1
<#
.SYNOPSIS
    Provision the private Python environment used by the dsh-iar-cspy bundle.

.DESCRIPTION
    Creates %LOCALAPPDATA%\dsh-iar-cspy\venv, installs the official IAR C-SPY
    MCP server (iar-cspy + iar-cspy-mcp) and the dsh_iar_launcher shim, then
    writes config.json with the detected IAR installation.

    The virtual environment lives outside the workspace on purpose: a venv
    created inside a sandboxed workspace inherits a Low integrity label, and
    Python then cannot write to %TEMP%, which makes CSpyServer2 fail with
    "No usable temporary directory found".

.PARAMETER IarPath
    IAR Embedded Workbench installation root (the directory containing
    common\bin). Auto-detected when omitted.

.PARAMETER Python
    Python 3.10+ executable used to create the venv. Auto-detected when omitted.

.PARAMETER CspyPySource
    Local checkout of https://github.com/iarsystems/cspy-py. Skips git clone.

.PARAMETER CspyMcpSource
    Local checkout of https://github.com/iarsystems/cspy-mcp. Skips git clone.

.PARAMETER Force
    Recreate the virtual environment even when it already exists.

.EXAMPLE
    .\setup.ps1 -IarPath 'D:\iar\ewarm-9.60.2'

.EXAMPLE
    .\setup.ps1 -CspyPySource 'D:\src\cspy-py' -CspyMcpSource 'D:\src\cspy-mcp'
#>
[CmdletBinding()]
param(
    [string]$IarPath,
    [string]$Python,
    [string]$CspyPySource,
    [string]$CspyMcpSource,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }

function Test-IarRoot([string]$Root) {
    if (-not $Root) { return $false }
    return (Test-Path (Join-Path $Root 'common\bin\CSpyServer2.exe')) -and
           (Test-Path (Join-Path $Root 'common\bin\IarServiceLauncher.exe'))
}

function Find-IarPath {
    param([string]$Explicit)
    if ($Explicit) {
        if (Test-IarRoot $Explicit) { return (Resolve-Path $Explicit).Path }
        throw "Not an IAR Embedded Workbench installation (common\bin\CSpyServer2.exe missing): $Explicit"
    }
    if ($env:IAR_INSTALL_PATH -and (Test-IarRoot $env:IAR_INSTALL_PATH)) {
        return (Resolve-Path $env:IAR_INSTALL_PATH).Path
    }

    $roots = @()
    if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'IAR Systems') }
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'IAR Systems') }
    $roots += @('C:\iar', 'C:\IAR', 'D:\iar', 'D:\IAR')

    $found = @()
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        foreach ($dir in Get-ChildItem $root -Directory -ErrorAction SilentlyContinue) {
            if (Test-IarRoot $dir.FullName) { $found += $dir.FullName }
        }
        if (Test-IarRoot $root) { $found += (Resolve-Path $root).Path }
    }
    $found = $found | Sort-Object -Unique
    if ($found.Count -eq 0) {
        throw 'No IAR Embedded Workbench installation found. Pass -IarPath <dir containing common\bin>.'
    }
    # The highest version wins; the folder name sorts well for ewarm-9.60.2 style paths.
    return ($found | Sort-Object -Descending | Select-Object -First 1)
}

function Find-Python {
    param([string]$Explicit)
    $candidates = @()
    if ($Explicit) { $candidates += $Explicit }
    $candidates += @('py -3.12', 'py -3.11', 'py -3.10', 'python')
    foreach ($candidate in $candidates) {
        $parts = $candidate.Split(' ')
        $exe = $parts[0]
        $pyArgs = @()
        if ($parts.Length -gt 1) { $pyArgs = $parts[1..($parts.Length - 1)] }
        try {
            $version = & $exe @pyArgs -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $version) { continue }
            $major, $minor = $version.Trim().Split('.')
            if ([int]$major -eq 3 -and [int]$minor -ge 10) {
                $script:PythonExe = $exe
                $script:PythonArgs = $pyArgs
                $script:PythonVersion = $version.Trim()
                return
            }
        } catch { }
    }
    throw 'Python 3.10+ not found. Pass -Python <path to python.exe>.'
}

Write-Step 'Locating IAR Embedded Workbench'
$iarRoot = Find-IarPath $IarPath
Write-Ok "IAR: $iarRoot"

Write-Step 'Locating Python 3.10+'
Find-Python $Python
Write-Ok "Python: $script:PythonExe $script:PythonVersion"

$stateRoot = if ($env:DSH_IAR_CSPY_HOME) { $env:DSH_IAR_CSPY_HOME } else { Join-Path $env:LOCALAPPDATA 'dsh-iar-cspy' }
$venvRoot = Join-Path $stateRoot 'venv'
$tmpRoot = Join-Path $stateRoot 'tmp'
$binRoot = Join-Path $stateRoot 'bin'
$srcRoot = Join-Path $stateRoot 'src'
$configPath = Join-Path $stateRoot 'config.json'

New-Item -ItemType Directory -Force -Path $stateRoot, $tmpRoot, $binRoot, $srcRoot | Out-Null

if ($Force -and (Test-Path $venvRoot)) {
    Write-Step 'Removing the existing virtual environment'
    Remove-Item $venvRoot -Recurse -Force
}

$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    Write-Step "Creating virtual environment: $venvRoot"
    $venvArgs = @($script:PythonArgs)
    & $script:PythonExe @venvArgs -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw "python -m venv failed with exit code $LASTEXITCODE" }
}
Write-Ok "venv: $venvRoot"

function Invoke-Pip {
    param([string[]]$PipArgs)
    & $venvPython -m pip --disable-pip-version-check --no-input @PipArgs
    if ($LASTEXITCODE -ne 0) { throw "pip $($PipArgs -join ' ') failed with exit code $LASTEXITCODE" }
}

Write-Step 'Installing runtime dependencies (thriftpy2, mcp)'
Invoke-Pip @('install', '--upgrade', 'thriftpy2>=0.5.2', 'mcp>=1.12.0,<2.0.0')

function Get-SourceCheckout {
    param([string]$Name, [string]$Url, [string]$Existing, [string]$Marker)
    if ($Existing) {
        if (-not (Test-Path (Join-Path $Existing $Marker))) {
            throw "$Existing does not look like $Name (missing $Marker)"
        }
        return (Resolve-Path $Existing).Path
    }
    $target = Join-Path $srcRoot $Name
    if (Test-Path (Join-Path $target $Marker)) {
        Write-Ok "reusing $target"
        return $target
    }
    Write-Step "Cloning $Url into $target"
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    & git clone --depth 1 $Url $target
    if ($LASTEXITCODE -ne 0) {
        throw "git clone failed. If the sandbox blocks git, clone manually and pass the local paths via -CspyPySource/-CspyMcpSource."
    }
    return $target
}

$cspyPy = Get-SourceCheckout -Name 'cspy-py' -Url 'https://github.com/iarsystems/cspy-py.git' -Existing $CspyPySource -Marker 'pyproject.toml'
$cspyMcp = Get-SourceCheckout -Name 'cspy-mcp' -Url 'https://github.com/iarsystems/cspy-mcp.git' -Existing $CspyMcpSource -Marker 'pyproject.toml'

Write-Step 'Installing iar-cspy (official)'
Invoke-Pip @('install', '--no-deps', '--force-reinstall', $cspyPy)
Write-Step 'Installing iar-cspy-mcp (official)'
Invoke-Pip @('install', '--no-deps', '--force-reinstall', $cspyMcp)

$packageRoot = Split-Path -Parent $PSScriptRoot
$launcherRoot = Join-Path $packageRoot 'launcher'
if (-not (Test-Path (Join-Path $launcherRoot 'pyproject.toml'))) {
    throw "Launcher package not found under $launcherRoot; run setup.ps1 from the dsh-iar-cspy package."
}
Write-Step 'Installing dsh_iar_launcher'
Invoke-Pip @('install', '--no-deps', '--force-reinstall', $launcherRoot)

Write-Step 'Writing configuration'
$config = [ordered]@{
    iarPath        = $iarRoot
    tempDir        = $tmpRoot
    venv           = $venvRoot
    launcher       = 'dsh_iar_launcher'
    installedAt    = (Get-Date).ToString('o')
    setupVersion   = '1.0.0'
    cspyPySource   = $cspyPy
    cspyMcpSource  = $cspyMcp
}
$json = $config | ConvertTo-Json
[IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "config: $configPath"

$scripts = @('setup.ps1', 'doctor.ps1', 'iar-launch.ps1')
foreach ($script in $scripts) {
    $source = Join-Path $PSScriptRoot $script
    if (Test-Path $source) { Copy-Item $source (Join-Path $binRoot $script) -Force }
}

Write-Step 'Running doctor'
& $venvPython -m dsh_iar_launcher --doctor
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 'Doctor reported a problem; see the output above.'
}

Write-Host ''
Write-Host 'Done. Next steps:' -ForegroundColor Green
Write-Host '  1. Reload the dsh-iar-cspy plugin (or start a new DeepSeek Harness session).'
Write-Host "  2. Wrapper scripts: $binRoot"
Write-Host "  3. Re-run diagnostics any time: $binRoot\doctor.ps1"
