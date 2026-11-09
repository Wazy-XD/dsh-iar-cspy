#Requires -Version 5.1
<#
.SYNOPSIS
    Generate a C-SPY launch configuration for an IAR Embedded Workbench project.

.DESCRIPTION
    Reads the .ewp configuration, finds the built executable and derives the CPU,
    FPU, endianness and semihosting flag from the linker map / command line.
    The result is the launch JSON the iar-cspy MCP tools expect for
    debugger_configure_and_start_session on products older than IDE platform 9.5
    (e.g. EWARM 9.60.2), where project_get_launch_config is not implemented.

    This mirrors what the IAR VS Code extension does: the extension ships launch
    templates and fills in the target options; this script fills them from the
    project's own build output instead of asking the user.

.PARAMETER Project
    Path to the .ewp file.

.PARAMETER Configuration
    Build configuration name. Defaults to the project's first configuration.

.PARAMETER Driver
    C-SPY driver name, for example Simulator, I-jet, J-Link/J-Trace, ST-LINK.

.PARAMETER Cpu
    Override the detected CPU name (for example Cortex-M4).

.PARAMETER Fpu
    Override the detected FPU name (for example None or VFPv4).

.PARAMETER Program
    Override the .out path.

.PARAMETER DriverOptions
    Extra raw driver options appended to the generated list.

.PARAMETER StopOnSymbol
    Symbol to stop at after the session starts. Defaults to main.

.PARAMETER Build
    Rebuild the configuration with iarbuild.exe before generating.

.PARAMETER OutFile
    Also write the JSON to this file.

.PARAMETER IarPath
    IAR installation root; defaults to config.json from setup.ps1.

.EXAMPLE
    .\iar-launch.ps1 -Project .\MyApp.ewp -Configuration Debug

.EXAMPLE
    .\iar-launch.ps1 -Project .\MyApp.ewp -Driver 'I-jet' -DriverOptions '--device=STM32F407VG','-p','C:\iar\arm\config\debugger\STLink.ddf'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$Configuration,
    [string]$Driver = 'Simulator',
    [string]$Cpu,
    [string]$Fpu,
    [string]$Program,
    [string[]]$DriverOptions = @(),
    [string]$StopOnSymbol = 'main',
    [switch]$Build,
    [string]$OutFile,
    [string]$IarPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Project)) { throw "Project not found: $Project" }
$Project = (Resolve-Path $Project).Path
if ([IO.Path]::GetExtension($Project) -ne '.ewp') { throw "Expected an .ewp project, got: $Project" }

$xml = [xml](Get-Content $Project -Raw)
$configurations = @($xml.project.configuration)
if ($configurations.Count -eq 0) { throw "No configurations in $Project" }
if (-not $Configuration) { $Configuration = $configurations[0].name }
$configNode = $configurations | Where-Object { $_.name -eq $Configuration } | Select-Object -First 1
if (-not $configNode) {
    $names = ($configurations | ForEach-Object { $_.name }) -join ', '
    throw "Configuration '$Configuration' not found. Available: $names"
}

$general = @($configNode.settings) | Where-Object { $_.name -eq 'General' } | Select-Object -First 1
$options = @{}
if ($general -and $general.data) {
    foreach ($option in @($general.data.option)) {
        if ($option.name) { $options[$option.name] = [string]$option.state }
    }
}

function Resolve-ProjectPath([string]$Value, [string]$Default) {
    $chosen = if ($Value) { $Value } else { $Default }
    $chosen = $chosen -replace '\$PROJ_DIR\$', (Split-Path -Parent $Project)
    if (-not [IO.Path]::IsPathRooted($chosen)) {
        $chosen = Join-Path (Split-Path -Parent $Project) $chosen
    }
    return [IO.Path]::GetFullPath($chosen)
}

$exeDir = Resolve-ProjectPath $options['ExePath'] 'Debug\Exe'
$listDir = Resolve-ProjectPath $options['ListPath'] 'Debug\List'

if ($IarPath) {
    $iarRoot = $IarPath
} else {
    $stateRoot = if ($env:DSH_IAR_CSPY_HOME) { $env:DSH_IAR_CSPY_HOME } else { Join-Path $env:LOCALAPPDATA 'dsh-iar-cspy' }
    $configPath = Join-Path $stateRoot 'config.json'
    if (Test-Path $configPath) {
        $iarRoot = (Get-Content $configPath -Raw | ConvertFrom-Json).iarPath
    }
}

if ($Build) {
    if (-not $iarRoot) { throw 'Build requested but no IAR path is known; pass -IarPath or run setup.ps1.' }
    $iarbuild = Join-Path $iarRoot 'common\bin\iarbuild.exe'
    if (-not (Test-Path $iarbuild)) { throw "iarbuild.exe not found under $iarRoot" }
    Write-Host "Building $Configuration with $iarbuild" -ForegroundColor Cyan
    & $iarbuild $Project -build $Configuration
    if ($LASTEXITCODE -ne 0) { throw "iarbuild failed with exit code $LASTEXITCODE" }
}

if (-not $Program) {
    if (-not (Test-Path $exeDir)) { throw "Executable directory does not exist: $exeDir. Build the project first, or pass -Program." }
    $candidate = Get-ChildItem $exeDir -Filter *.out -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $candidate) { throw "No .out file in $exeDir. Build the project first, or pass -Program." }
    $Program = $candidate.FullName
}
$Program = [IO.Path]::GetFullPath($Program)
if (-not (Test-Path $Program)) { throw "Program does not exist: $Program" }

$mapCommand = ''
$mapPath = Join-Path $listDir ([IO.Path]::GetFileNameWithoutExtension($Program) + '.map')
if (-not (Test-Path $mapPath)) {
    $mapPath = Get-ChildItem $listDir -Filter *.map -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if ($mapPath -and (Test-Path $mapPath)) {
    $mapText = Get-Content $mapPath -Raw
    $commandMatch = [regex]::Match($mapText, '(?s)Command line\s*=\s*(.*?)(?:\r?\n\s*#\s*\r?\n|\r?\n#{3,})')
    if ($commandMatch.Success) { $mapCommand = $commandMatch.Groups[1].Value }
    if (-not $mapCommand) { $mapCommand = $mapText }
}

if (-not $Cpu) {
    $match = [regex]::Match($mapCommand, '--cpu=([^\s)]+)')
    if ($match.Success) { $Cpu = $match.Groups[1].Value }
}
if (-not $Fpu) {
    $match = [regex]::Match($mapCommand, '--fpu=([^\s)]+)')
    if ($match.Success) { $Fpu = $match.Groups[1].Value }
}
if (-not $Cpu) {
    throw 'Could not detect the CPU: no --cpu= in the linker map. Build once, or pass -Cpu (for example Cortex-M4).'
}
if (-not $Fpu) { $Fpu = 'None' }

$endian = 'little'
if ($options['GEndianMode'] -eq '1') { $endian = 'big' }
$semihosting = $mapCommand -match '--semihosting'

$generatedOptions = [System.Collections.Generic.List[string]]::new()
$generatedOptions.Add("--endian=$endian")
$generatedOptions.Add("--cpu=$Cpu")
$generatedOptions.Add("--fpu=$Fpu")
if ($semihosting) { $generatedOptions.Add('--semihosting') }
foreach ($extra in $DriverOptions) { $generatedOptions.Add($extra) }

if ($Driver -ne 'Simulator' -and $DriverOptions.Count -eq 0) {
    Write-Warning "Driver '$Driver' usually needs device options (--device=..., -p <driver>.ddf). Add them with -DriverOptions."
}

$launch = [ordered]@{
    type                 = 'cspy'
    request              = 'launch'
    name                 = "$([IO.Path]::GetFileNameWithoutExtension($Project)) $Configuration ($Driver)"
    target               = 'arm'
    program              = $Program
    driver               = $Driver
    driverOptions        = @($generatedOptions)
    stopOnSymbol         = $StopOnSymbol
    projectPath          = $Project
    projectConfiguration = $Configuration
}

$json = $launch | ConvertTo-Json -Depth 6
if ($OutFile) {
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutFile), $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Wrote $OutFile" -ForegroundColor Green
}
Write-Output $json
