#Requires -Version 5.1
<#
.SYNOPSIS
    Provision the private Python environment used by the dsh-iar-cspy bundle.

.DESCRIPTION
    Creates %LOCALAPPDATA%\dsh-iar-cspy\venv (or %DSH_IAR_CSPY_HOME%\venv), installs the
    official IAR C-SPY MCP server (iar-cspy + iar-cspy-mcp) from local checkouts or by
    shallow git clone, and writes config.json with the detected IAR installation and the
    venv interpreter.

    The virtual environment lives outside the workspace on purpose: a venv created inside
    a sandboxed workspace inherits a Low integrity label, and Python then cannot write to
    %TEMP%, which makes CSpyServer2 fail with "No usable temporary directory found".

    This script is a provisioner only. The DSH plugin starts the MCP server itself as
    <mcpPython> -m iar_cspy_mcp --iar-path <iarPath>, so no launcher package is installed.

.PARAMETER IarPath
    IAR Embedded Workbench root, the directory containing common\bin. Overrides
    IAR_INSTALL_PATH and auto-detection.

.PARAMETER Python
    Python 3.10+ interpreter used to create the venv. Auto-detected when omitted.

.PARAMETER CspyPySource
    Local checkout of https://github.com/iarsystems/cspy-py. Skips git clone.

.PARAMETER CspyMcpSource
    Local checkout of https://github.com/iarsystems/cspy-mcp. Skips git clone.

.PARAMETER Force
    Recreate the virtual environment even when it already exists.

.EXAMPLE
    .\setup.ps1 -IarPath 'D:\iar\ewarm-9.60.2'

.EXAMPLE
    .\setup.ps1 -CspyPySource 'D:\src\cspy-py' -CspyMcpSource 'D:\src\cspy-mcp' -Force
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

$SetupVersion = '2.0.0'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }

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

function Test-IarRoot {
    param([string]$Root)
    if (-not $Root) { return $false }
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $false }
    $server = Join-Path $Root 'common\bin\CSpyServer2.exe'
    $launcher = Join-Path $Root 'common\bin\IarServiceLauncher.exe'
    return (Test-Path -LiteralPath $server -PathType Leaf) -and
           (Test-Path -LiteralPath $launcher -PathType Leaf)
}

function Find-IarPath {
    param([string]$Explicit)

    $explicitPath = ConvertTo-CleanPath $Explicit
    if ($explicitPath) {
        if (Test-Path -LiteralPath $explicitPath -PathType Container) {
            $explicitPath = (Get-Item -LiteralPath $explicitPath).FullName
        }
        if (-not (Test-IarRoot $explicitPath)) {
            throw "Not an IAR Embedded Workbench root: $explicitPath (expected common\bin\CSpyServer2.exe and common\bin\IarServiceLauncher.exe)."
        }
        return $explicitPath
    }

    $envPath = ConvertTo-CleanPath $env:IAR_INSTALL_PATH
    if ($envPath) {
        if (Test-IarRoot $envPath) {
            return (Get-Item -LiteralPath $envPath).FullName
        }
        Write-Warn "Ignoring IAR_INSTALL_PATH=$envPath (common\bin\CSpyServer2.exe not found there)."
    }

    $scanRoots = @()
    if ($env:ProgramFiles) { $scanRoots += (Join-Path $env:ProgramFiles 'IAR Systems') }
    if (${env:ProgramFiles(x86)}) { $scanRoots += (Join-Path ${env:ProgramFiles(x86)} 'IAR Systems') }
    $scanRoots += @('C:\iar', 'C:\IAR', 'D:\iar', 'D:\IAR')

    $candidates = @()
    foreach ($root in $scanRoots) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        if (Test-IarRoot $root) {
            $candidates += (Get-Item -LiteralPath $root).FullName
        }
        $children = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)
        foreach ($child in $children) {
            if (Test-IarRoot $child.FullName) { $candidates += $child.FullName }
        }
    }
    $candidates = @($candidates | Sort-Object -Unique)
    if ($candidates.Count -eq 0) {
        throw 'No IAR Embedded Workbench installation found. Pass -IarPath <root containing common\bin>, or set IAR_INSTALL_PATH.'
    }

    # Highest version wins. Folder names such as ewarm-9.60.2, "Embedded Workbench 9.50.2"
    # sort correctly by name within one family of installations.
    $ranked = @($candidates | Sort-Object -Property @{ Expression = { Split-Path -Leaf $_ } }, @{ Expression = { $_ } } -Descending)
    return $ranked[0]
}

function Resolve-PythonSpec {
    param([string]$Spec)
    if (-not $Spec) { return $null }
    $specText = $Spec.Trim().Trim('"')
    if (-not $specText) { return $null }
    if (Test-Path -LiteralPath $specText -PathType Leaf) {
        return [pscustomobject]@{
            Exe = (Get-Item -LiteralPath $specText).FullName
            Args = @()
        }
    }
    $parts = @($specText.Split(' ') | Where-Object { $_ -ne '' })
    if ($parts.Count -eq 0) { return $null }
    $exe = $parts[0]
    $arguments = @()
    if ($parts.Count -gt 1) { $arguments = $parts[1..($parts.Count - 1)] }
    return [pscustomobject]@{ Exe = $exe; Args = $arguments }
}

function Test-PythonCandidate {
    param($Candidate)
    if ($null -eq $Candidate) { return $null }
    if ($Candidate.Exe -match '[\\/]') {
        if (-not (Test-Path -LiteralPath $Candidate.Exe -PathType Leaf)) { return $null }
    }
    try {
        $probeArgs = @($Candidate.Args) + @('-c', "import sys; print('%d.%d.%d' % sys.version_info[:3])")
        $raw = & $Candidate.Exe @probeArgs 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        $text = ((@($raw) | ForEach-Object { "$_" }) -join '').Trim()
    } catch {
        return $null
    }
    $versionParts = @($text.Split('.'))
    if ($versionParts.Count -lt 2) { return $null }
    try {
        $major = [int]$versionParts[0]
        $minor = [int]$versionParts[1]
    } catch {
        return $null
    }
    if ($major -ne 3 -or $minor -lt 10) { return $null }
    $display = $Candidate.Exe
    if ($Candidate.Args.Count -gt 0) { $display = "$display $($Candidate.Args -join ' ')" }
    return [pscustomobject]@{
        Exe = $Candidate.Exe
        Args = $Candidate.Args
        Version = $text
        Display = $display
    }
}

function Find-Python {
    param([string]$Explicit)
    if ($Explicit) {
        $candidate = Resolve-PythonSpec $Explicit
        $result = Test-PythonCandidate $candidate
        if ($null -eq $result) {
            throw "The interpreter passed with -Python is not a usable Python 3.10+ executable: $Explicit"
        }
        $script:PythonExe = $result.Exe
        $script:PythonArgs = @($result.Args)
        $script:PythonDisplay = $result.Display
        $script:PythonVersion = $result.Version
        return
    }
    $specs = @('py -3.12', 'py -3.11', 'py -3.10', 'python')
    foreach ($spec in $specs) {
        $candidate = Resolve-PythonSpec $spec
        $result = Test-PythonCandidate $candidate
        if ($null -ne $result) {
            $script:PythonExe = $result.Exe
            $script:PythonArgs = @($result.Args)
            $script:PythonDisplay = $result.Display
            $script:PythonVersion = $result.Version
            return
        }
    }
    throw 'Python 3.10 or newer not found. Install Python 3.10+ and make sure "py" or "python" is on PATH, or pass -Python <path to python.exe>.'
}

function Get-SourceCheckout {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Existing,
        [string]$Marker
    )
    $existingPath = ConvertTo-CleanPath $Existing
    if ($existingPath) {
        if (-not (Test-Path -LiteralPath $existingPath -PathType Container)) {
            throw "The given $Name checkout does not exist: $existingPath"
        }
        $resolved = (Get-Item -LiteralPath $existingPath).FullName
        if (-not (Test-Path -LiteralPath (Join-Path $resolved $Marker) -PathType Leaf)) {
            throw "The given $Name checkout has no $Marker at its root: $resolved"
        }
        return $resolved
    }

    $target = Join-Path $srcRoot $Name
    if (Test-Path -LiteralPath (Join-Path $target $Marker) -PathType Leaf) {
        Write-Ok "Reusing the local checkout: $target"
        return $target
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "git was not found on PATH. Install Git, or pass -CspyPySource and -CspyMcpSource with local checkouts."
    }
    Write-Step "Cloning $Url"
    & git clone --depth 1 $Url $target
    if ($LASTEXITCODE -ne 0) {
        throw "git clone failed with exit code $LASTEXITCODE. Check network access, or pass local checkouts with -CspyPySource and -CspyMcpSource."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $target $Marker) -PathType Leaf)) {
        throw "git clone did not produce $Marker in $target."
    }
    return $target
}

function Invoke-Pip {
    param([string[]]$PipArgs)
    & $venvPython -m pip --disable-pip-version-check --no-input @PipArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pip $($PipArgs -join ' ') failed with exit code $LASTEXITCODE. Check network access to PyPI, or re-run with local checkouts."
    }
}

try {
    Write-Step 'Locating IAR Embedded Workbench'
    $iarRoot = Find-IarPath $IarPath
    Write-Ok "IAR root: $iarRoot"

    Write-Step 'Locating Python 3.10 or newer'
    Find-Python $Python
    Write-Ok "Python: $script:PythonDisplay (version $script:PythonVersion)"

    $stateRoot = Get-StateRoot
    $venvRoot = Join-Path $stateRoot 'venv'
    $venvPython = Join-Path $venvRoot 'Scripts\python.exe'
    $srcRoot = Join-Path $stateRoot 'src'
    $binRoot = Join-Path $stateRoot 'bin'
    $tmpRoot = Join-Path $stateRoot 'tmp'
    $configPath = Join-Path $stateRoot 'config.json'

    Write-Step 'Preparing the state directory'
    New-Item -ItemType Directory -Force -Path @($stateRoot, $tmpRoot, $binRoot, $srcRoot) | Out-Null
    Write-Ok "State: $stateRoot"

    if ($Force -and (Test-Path -LiteralPath $venvRoot)) {
        Write-Step 'Removing the existing virtual environment (-Force)'
        try {
            Remove-Item -LiteralPath $venvRoot -Recurse -Force -ErrorAction Stop
        } catch {
            throw "Cannot remove $venvRoot. Close any DeepSeek Harness session or process that is using this virtual environment, then retry. ($($_.Exception.Message))"
        }
    }

    if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
        Write-Step "Creating the virtual environment: $venvRoot"
        $venvArguments = @($script:PythonArgs) + @('-m', 'venv', $venvRoot)
        & $script:PythonExe @venvArguments
        if ($LASTEXITCODE -ne 0) {
            throw "python -m venv failed with exit code $LASTEXITCODE. Delete $venvRoot and retry, or pass -Python <python.exe>."
        }
        if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
            throw "The virtual environment was created but $venvPython is missing. Delete $venvRoot and retry."
        }
    } else {
        Write-Ok "Reusing the virtual environment: $venvRoot"
    }
    Write-Ok "Python in the venv: $venvPython"

    Write-Step 'Installing runtime dependencies from PyPI (thriftpy2, mcp)'
    Invoke-Pip @('install', '--upgrade', 'thriftpy2>=0.5.2', 'mcp>=1.12.0,<2.0.0')
    Write-Ok 'Runtime dependencies are installed.'

    $cspyPy = Get-SourceCheckout -Name 'cspy-py' -Url 'https://github.com/iarsystems/cspy-py.git' -Existing $CspyPySource -Marker 'pyproject.toml'
    $cspyMcp = Get-SourceCheckout -Name 'cspy-mcp' -Url 'https://github.com/iarsystems/cspy-mcp.git' -Existing $CspyMcpSource -Marker 'pyproject.toml'

    Write-Step 'Installing iar-cspy from the local checkout'
    Invoke-Pip @('install', '--no-deps', '--force-reinstall', $cspyPy)
    Write-Ok 'iar-cspy installed.'

    Write-Step 'Installing iar-cspy-mcp from the local checkout'
    Invoke-Pip @('install', '--no-deps', '--force-reinstall', $cspyMcp)
    Write-Ok 'iar-cspy-mcp installed.'

    Write-Step 'Writing config.json'
    $config = [ordered]@{
        iarPath      = $iarRoot
        mcpPython    = $venvPython
        tempDir      = $tmpRoot
        installedAt  = (Get-Date).ToString('o')
        setupVersion = $SetupVersion
    }
    $json = $config | ConvertTo-Json
    [IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "Config: $configPath"

    Write-Step 'Copying helper scripts to the bin directory'
    foreach ($helper in @('setup.ps1', 'doctor.ps1', 'iar-launch.ps1')) {
        $source = Join-Path $PSScriptRoot $helper
        $destination = Join-Path $binRoot $helper
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            Write-Warn "Not found next to setup.ps1, skipped: $helper"
            continue
        }
        if ([IO.Path]::GetFullPath($source) -eq [IO.Path]::GetFullPath($destination)) {
            Write-Ok "Already running from the bin directory: $helper"
            continue
        }
        Copy-Item -LiteralPath $source -Destination $destination -Force
        Write-Ok $helper
    }

    Write-Step 'Running the self-check'
    $importArgs = @('-c', "import iar_cspy, iar_cspy_mcp; print('ok')")
    $importOutput = & $venvPython @importArgs 2>&1
    $importExit = $LASTEXITCODE
    if ($importExit -ne 0) {
        $detail = (@($importOutput) | ForEach-Object { "$_" }) -join [Environment]::NewLine
        throw "The final self-check failed (exit code $importExit).`n$detail`nRe-run setup.ps1 -Force after fixing the error above."
    }
    Write-Ok 'import iar_cspy, iar_cspy_mcp: ok'
} catch {
    Write-Host ''
    Write-Host ("Setup failed: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host "  state:   $stateRoot"
Write-Host "  config:  $configPath"
Write-Host "  venv:    $venvRoot"
Write-Host "  scripts: $binRoot"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Reload the dsh-iar-cspy plugin, or start a new DeepSeek Harness session, so the'
Write-Host '     mcp__iar__ tools appear.'
Write-Host '  2. The DSH plugin configuration (Plugins page -> dsh-iar-cspy -> Configure) overrides'
Write-Host '     config.json. config.json is only the auto-detection fallback.'
Write-Host "  3. Diagnostics: $binRoot\doctor.ps1   (add -Probe to start and stop CSpyServer2)"
Write-Host "  4. Launch helper: $binRoot\iar-launch.ps1 -Project <app.ewp>"
