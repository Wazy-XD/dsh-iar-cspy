# dsh-iar-cspy

[中文](README.md) | English

## Introduction

`dsh-iar-cspy` 2.0.0 is a DeepSeek Harness (DSH) bundle for the official
[IAR C-SPY MCP server](https://github.com/iarsystems/cspy-mcp). Once installed, the
agent can build IAR Embedded Workbench `.ewp` projects in the conversation, start
C-SPY debug sessions on the simulator or a hardware probe, and inspect variables,
registers, memory, the call stack and target output. The IAR installation path,
the Python that runs MCP, the temporary directory and the call timeout are all set
on the DSH plugin configuration page.

The upstream Python packages are left untouched: `scripts\setup.ps1` installs
`iar-cspy` and `iar-cspy-mcp` into a private venv under
`%LOCALAPPDATA%\dsh-iar-cspy`. The bundle itself provides the two DSH rows (the
host plugin `iar-cspy` and the MCP client row `iar-cspy-mcp`), the configuration
schema and page, the `iar-cspy` skill, and helper scripts such as
`iar-launch.ps1`. The plugin never runs `pip` at runtime.

## Capabilities

- **83 official MCP tools** (`mcp__iar__*`): `project_*` for builds and project
  information, `debugger_*` for sessions and run control, `breakpoints_*` for
  breakpoints/watchpoints/logpoints, `contextmanager_*` and `symbols_*` for stacks
  and symbols, `memory_*`, `disassembly_*` and `sourcelookup_*` for memory,
  disassembly and source mapping, `libsupport_*` for target stdin/stdout,
  `listwindow_*` for trace windows, plus `ide_services_*` and
  `projectmanager_call` as escape hatches.
- **The `iar-cspy` skill**: available to both the user and the model; it loads
  automatically when a task mentions IAR, EWARM, C-SPY, `.ewp`/`.eww` or iarbuild.
  It covers the tool map, build and debug workflows, launch JSON, the EWARM
  9.60.2 limits and hardware safety.
- **The configuration page**: DSH sidebar **Plugins → dsh-iar-cspy**, then
  **Configure** on the `iar-cspy` row, for the IAR path, MCP Python, temporary
  directory, timeout and extra arguments.
  Empty fields are auto-detected. Saving reloads the MCP connection automatically;
  no DSH restart is needed.
- **The `iar_cspy_status` tool**: reports the resolved `iarPath`, `mcpPython`,
  `tempDir`, `toolCallTimeoutMs` and `stateDir`, plus anything that is missing, so
  "why are the tools not connected?" is quick to answer.
- **`scripts\iar-launch.ps1`**: generates a launch JSON from the `.ewp` and its
  linker map, including `--cpu`, `--fpu`, endianness and semihosting, with
  overrides for the driver, program and extra driver options.
- **A separate C-SPY backend**: sessions run through the plugin's own MCP process
  and are independent of an open IAR IDE window. A dropped connection is retried
  with a 1 s to 30 s backoff (up to 50 attempts), and a startup failure does not
  take DSH down.

See [PARITY.md](PARITY.md) for the command-by-command comparison with the official
IAR VS Code extensions.

## Prerequisites

- Windows. The IAR C-SPY backend and EWARM are Windows-only.
- IAR Embedded Workbench for Arm installed. Its root must contain
  `common\bin\CSpyServer2.exe` and `common\bin\IarServiceLauncher.exe`.
  Verified end to end on **EWARM 9.60.2** (IAR IDE Platform 9.3.5).
- Running `scripts\setup.ps1` needs Python 3.10+, Git, and network access to
  GitHub/PyPI. Local source checkouts (`-CspyPySource` / `-CspyMcpSource`) skip
  Git; alternatively, skip setup entirely and use your own Python environment
  (see below).
- The private venv and temporary directory must be writable and outside a
  **sandboxed workspace**. The default location is
  `%LOCALAPPDATA%\dsh-iar-cspy`.

## Install and configure

### 1. Install the bundle

Install the current version in DSH (the GitHub release tgz):

```
plugin_manager install_bundle target=https://github.com/Wazy-XD/dsh-iar-cspy/releases/download/v2.0.0/dsh-iar-cspy-2.0.0.tgz
```

A local tgz also works, as does `target=dsh-iar-cspy@2.0.0` once it is published
to npm. After installation the bundle inserts two rows into the profile:
`iar-cspy` (the host plugin) and `iar-cspy-mcp` (the MCP client).

### 2. Prepare the Python environment for MCP

The bundle starts MCP but does not install Python packages. Locate the setup
script inside the installed package and run it once:

```powershell
$setup = Get-ChildItem "$env:USERPROFILE\.dsh\profiles\*\node_modules\dsh-iar-cspy\scripts\setup.ps1" |
    Select-Object -First 1
& $setup.FullName
```

If the script is not found, confirm that the bundle is installed; you can also run
`scripts\setup.ps1` directly from an unpacked release.

The script:

- locates IAR (`IAR_INSTALL_PATH` first, then the common install roots);
- creates the private venv at `%LOCALAPPDATA%\dsh-iar-cspy\venv`;
- installs `thriftpy2`, `mcp`, and the official `iar-cspy` and `iar-cspy-mcp`;
- writes `config.json` (`iarPath`, `mcpPython`, `tempDir`);
- copies `setup.ps1`, `doctor.ps1` and `iar-launch.ps1` into
  `%LOCALAPPDATA%\dsh-iar-cspy\bin`;
- runs an `import iar_cspy, iar_cspy_mcp` self-check.

If IAR cannot be found, pass its root as prompted:

```powershell
& $setup.FullName -IarPath 'C:\Program Files\IAR Systems\Embedded Workbench 9.60'
```

Other parameters: `-Python <python.exe>` selects a 3.10+ interpreter; `-Force`
recreates the venv; `-CspyPySource` / `-CspyMcpSource` use local source checkouts
and avoid `git clone`. The script deliberately keeps the private environment under
`%LOCALAPPDATA%` instead of the workspace; see
[Troubleshooting](#troubleshooting) for why.

> To use your own Python environment, skip this step: point `mcpPython` at that
> environment's `python.exe` in the next section, and make sure `iar-cspy` and
> `iar-cspy-mcp` are installed there.

### 3. Configure in DSH

Open the DSH sidebar **Plugins → dsh-iar-cspy**: edit the fields on the `iar-cspy`
row's **Configure** page; the bundle detail page's **configuration** section provides
the install/update command and notes. The fields:

| Field | Purpose | When empty |
| --- | --- | --- |
| `iarPath` | IAR root (contains `common\bin`) | Checks `IAR_INSTALL_PATH`, then `%LOCALAPPDATA%\dsh-iar-cspy\config.json`, then the common install roots; both executables must exist |
| `mcpPython` | `python.exe` that launches MCP | Uses `config.json`'s `mcpPython`, then falls back to `%LOCALAPPDATA%\dsh-iar-cspy\venv\Scripts\python.exe` |
| `tempDir` | `TEMP`/`TMP` for the MCP process | `%LOCALAPPDATA%\dsh-iar-cspy\tmp` |
| `toolCallTimeoutMs` | Per-call MCP timeout in milliseconds | `600000` (10 minutes) |
| `extraArgs` | Extra arguments appended to the MCP command (one per line in the UI) | Empty |

The bundle detail page and the row configuration page both offer an
**Install / update MCP** button: the Host runs `setup.ps1`, the page shows the
status and the tail of the output, and on success the plugin writes
`iarPath`/`mcpPython` and reconnects automatically — no DSH restart. The
equivalent manual command (with an `-IarPath "<IAR install directory>"`
placeholder) stays below the button for troubleshooting outside the page.
Values on the configuration page take precedence over `config.json`;
`config.json` only participates in auto-detection for `iarPath` and `mcpPython`
when those fields are empty.

The launch command is equivalent to:

```
<mcpPython> -m iar_cspy_mcp --iar-path <iarPath> [extraArgs]
```

The MCP process gets `TEMP`/`TMP` set to `tempDir` and `IAR_INSTALL_PATH` set to
the resolved `iarPath`.

Saving the configuration makes the plugin re-resolve its settings and reload the
MCP connection automatically; no DSH restart is needed. If `mcp__iar__*` still
does not appear, reload the plugin or start a new session.

### 4. Verify

Ask the agent to call `iar_cspy_status`, or ask "are the IAR tools connected?".
It reports the resolved IAR path, Python, temporary directory and timeout. When
`configured` is true and both `mcpPythonExists` and `iarExecutables` are true, the
`mcp__iar__*` tools are usable.

## Usage

### Skill and conversation

The bundle registers the `iar-cspy` skill, invocable by both the model and the
user. It loads automatically when a task mentions IAR, EWARM, C-SPY,
`.ewp`/`.eww` or iarbuild; you can also name the skill explicitly in the
conversation. Its content covers the tool map, build/debug workflows, launch JSON
templates, the 9.60.2 legacy limits and hardware safety.

You can ask, for example:

- "Build and debug `D:\work\app\app.ewp` with IAR, Debug configuration."
- "Run this project on the simulator, stop at `main`, then read the printf
  output."
- "This project uses J-Link with an STM32F407VG; generate the launch
  configuration and start it."

### Build

The agent loads the project first, then calls `project_build`. On 9.60.2
`project_load_workspace` is unavailable, so use `projectmanager_call` with
`LoadEwpFile` (once per new MCP backend process):

```
projectmanager_call(method="LoadEwpFile", args_json='["D:\work\app\app.ewp", true]')
project_build(project_path="D:\work\app\app.ewp", config_name="Debug", num_parallel_builds=4, max_output_lines=40)
```

On newer IDE platforms the first step can be `project_load_workspace(file_path)`.
Skipping the load makes 9.60.2's ProjectManager answer `Unknown project`.

A failed build is not an exception: the result is `ok=false`; read
`data.succeeded` and `data.output_tail`. Real projects often build for longer than
the MCP default of 60 seconds, so this plugin defaults `toolCallTimeoutMs` to
10 minutes; raise it on the configuration page for very large projects.

`project_build` maps to the incremental `BuildProject`. For a full rebuild or a
clean, use IAR's own `iarbuild.exe`:

```powershell
& 'C:\Program Files\IAR Systems\Embedded Workbench 9.60\common\bin\iarbuild.exe' `
    'D:\work\app\app.ewp' -build Debug
& 'C:\Program Files\IAR Systems\Embedded Workbench 9.60\common\bin\iarbuild.exe' `
    'D:\work\app\app.ewp' -clean Debug
```

### Debug

Recommended flow:

1. Build the target configuration first.
2. Generate a launch JSON with `scripts\iar-launch.ps1` (next section).
3. Call `debugger_configure_and_start_session(launch_json=<JSON string>)`. When
   `stopOnSymbol` is set, the session runs to that symbol and reports the result
   in `stopOnSymbol` / `stopOnSymbolError`.
4. Confirm the connection with `debugger_session_status` and
   `debugger_get_core_state`; then inspect with `debugger_register_snapshot`,
   `contextmanager_get_locals/parameters/stack`, `symbols_lookup`,
   `debugger_eval_expression`, `memory_read` and
   `disassembly_disassemble_range`.
5. Run with `debugger_go` or `debugger_go_and_wait_for_core_state`; step with
   `debugger_step_over`, `step_into` and `step_out`. Read target output with
   `libsupport_get_output`.
6. Call `debugger_stop_session` when done. The next start recreates the managed
   backend, so a new session begins from a clean process.

> **Hardware safety**: a debug session pauses, resets and can even flash real
> hardware. Confirm before the first flash on an unfamiliar board, and close the
> sessions you opened.

### Launch JSON

`scripts\iar-launch.ps1` reads the `.ewp` output paths, finds the `.out`, and
takes `--cpu`, `--fpu`, endianness and `--semihosting` from the linker map's
command line:

```powershell
& "$env:LOCALAPPDATA\dsh-iar-cspy\bin\iar-launch.ps1" `
    -Project 'D:\work\app\app.ewp' -Configuration Debug
```

The commonly used parameters:

| Parameter | Description |
| --- | --- |
| `-Project` | Path to the `.ewp` (required) |
| `-Configuration` | Configuration name; the first one is used when omitted |
| `-Driver` | C-SPY driver, default `Simulator` |
| `-Cpu` / `-Fpu` | Override the CPU/FPU detected from the linker map |
| `-Program` | Override the `.out` path |
| `-DriverOptions` | Extra raw driver options, as a string array |
| `-StopOnSymbol` | Stop at this symbol after start, default `main` |
| `-Build` | Build with `iarbuild.exe` before generating |
| `-OutFile` | Also write the JSON to a file |

`-Build` needs the IAR root: the script reads `config.json`, or use `-IarPath` to
name it explicitly. Without `-Build`, generating the launch JSON does not depend
on the IAR installation path.

The generated JSON looks like:

```json
{
  "type": "cspy",
  "request": "launch",
  "name": "app Debug (Simulator)",
  "target": "arm",
  "program": "D:\\work\\app\\Debug\\Exe\\app.out",
  "driver": "Simulator",
  "driverOptions": ["--endian=little", "--cpu=Cortex-M3", "--fpu=None", "--semihosting"],
  "stopOnSymbol": "main",
  "projectPath": "D:\\work\\app\\app.ewp",
  "projectConfiguration": "Debug"
}
```

The script includes `projectPath` and `projectConfiguration` in its output; on
9.60.2, `debugger_configure_and_start_session` requires only `program`, `target`,
`driver` and `driverOptions`; the other fields are optional.

Driver names follow IAR's launch.json: `Simulator`, `64-bit Simulator`, `I-jet`,
`CMSIS DAP`, `J-Link/J-Trace`, `ST-LINK`, `GDB Server`, `TI XDS`, and so on.
Hardware probes usually also need a device description and a ddf; the script does
not generate those, so pass them with `-DriverOptions`, for example:

```powershell
-DriverOptions '--device=STM32F407VG','-p','C:\iar\ewarm-9.60.2\arm\config\debugger\STLink.ddf'
```

The `workspaceFolder` variable in a launch configuration resolves against the
**process working directory**, not the project directory. Always pass absolute
paths, or use the JSON generated by the script.

## EWARM 9.60.2 limits

The EWARM 9.60.2 backend reports IAR IDE Platform 9.3.5 and predates some of the
ProjectManager methods the MCP server targets. These official tools fail with
`Invalid method name`; do not retry them:

| Tool | Missing method | Alternative |
| --- | --- | --- |
| `project_load_workspace`, `project_status` | `HasWorkspace` | Call `project_build` with an explicit path; if a tool insists on a loaded project, use `projectmanager_call(method="LoadEwpFile", args_json='["<absolute .ewp>", true]')` |
| `project_get_launch_config`, `project_configure_and_start_debug` | `GetLaunchConfigurationForConfiguration` | Generate the JSON with `scripts\iar-launch.ps1`, then call `debugger_configure_and_start_session` |
| `options_*` | 9.60.2 ships no OptionsService | Read the `.ewp`, or change the options in the local IAR IDE |

Everything else — building, configuring a session, starting, run control,
breakpoints, variables/registers/memory/call stack, and target output — was
exercised on 9.60.2, including a complete simulator run of the shipped
`GettingStarted` project and reading its firmware printf output through
`libsupport_get_output`.

## Troubleshooting

**No `mcp__iar__*` tools, or calls report that the plugin is not configured.**
Ask the agent to call `iar_cspy_status`; it reports the resolved paths and what is
missing. The usual cause is that `setup.ps1` has not been run, or the configured
`mcpPython` does not exist. Run setup, check the `iar-cspy` row's configuration
under **Plugins → dsh-iar-cspy**, save and let the connection reload; reload the
plugin or start a new session if needed. The `iar-cspy-mcp` row sets
`failOnStartupError: false`, so an MCP that fails to start does not take DSH down;
it only shows up as missing tools or failing calls.

**`No usable temporary directory found`.**
The venv or the process carries a Low integrity label, typically because it was
created inside a sandboxed workspace; Python then cannot write `%TEMP%` and
CSpyServer2 fails to start. Keep the private venv and `tempDir` outside the
sandboxed workspace (the default is `%LOCALAPPDATA%\dsh-iar-cspy`). Re-run
`setup.ps1`, or point `tempDir` at a writable directory on the configuration
page; `%LOCALAPPDATA%\dsh-iar-cspy\bin\doctor.ps1` performs a write probe.

**`pip` or `git` is blocked by the sandbox.**
Run setup from a normal PowerShell outside the sandbox, or clone
[cspy-py](https://github.com/iarsystems/cspy-py) and
[cspy-mcp](https://github.com/iarsystems/cspy-mcp) elsewhere and pass
`-CspyPySource` / `-CspyMcpSource`. You can also skip setup entirely and point
`mcpPython` at an environment that already has `iar-cspy` and `iar-cspy-mcp`.

**A build times out.**
The plugin gives MCP calls 10 minutes by default. If a project still times out,
raise `toolCallTimeoutMs` on the configuration page (for example `1200000` for
20 minutes), save, and retry.

**A hardware probe fails to start.**
A probe driver needs its device and ddf options; they are not generated
automatically. Pass `--device=<part>` and
`-p <EWARM>\arm\config\debugger\<driver>.ddf` through `-DriverOptions` or the
launch JSON's `driverOptions`; the ddf names differ between probes (J-Link,
ST-LINK, I-jet, CMSIS DAP). Confirm the board state before the first flash.

**Setup reports that Python 3.10+ was not found.**
Install Python 3.10+ and make sure `py` or `python` is on `PATH`, or pass
`-Python` with the path to `python.exe`.

## Layout

```
dsh-iar-cspy/
  cordis.patch.yml       Inserts the iar-cspy (host plugin) and iar-cspy-mcp (MCP client) rows
  index.js               Host plugin: configuration schema, path/Python detection,
                         iarCspyConfig service, iar-cspy skill, iar_cspy_status tool
  client.js              Configuration page and install/update section (Web UI)
  locale/zh.json         Chinese title, description and README entry
  locale/en.json         English title, description and README entry
  scripts/setup.ps1      Creates the private venv, installs official iar-cspy/iar-cspy-mcp, writes config.json
  scripts/doctor.ps1     Diagnoses configuration, packages and temp directory; -Probe starts/stops CSpyServer2
  scripts/iar-launch.ps1 Generates launch JSON from .ewp + linker map
  icon.svg               Plugin icon
```

The runtime state directory (default):

```
%LOCALAPPDATA%\dsh-iar-cspy\
  venv\                  Private Python environment
  config.json            Paths used for auto-detection (read when iarPath/mcpPython is empty)
  tmp\                   Temporary directory for MCP/CSpyServer2
  src\                   Upstream sources cloned by setup
  bin\                   Helper scripts copied by setup
```

## Uninstall

Remove the bundle and the two rows it inserts with
`plugin_manager remove_bundle target=dsh-iar-cspy`. If the private Python
environment is no longer needed, delete `%LOCALAPPDATA%\dsh-iar-cspy`. Uninstalling
does not touch your IAR installation or project files, and does not delete a
Python environment you configured yourself.

## License

MIT. The upstream `cspy-py` and `cspy-mcp` projects are MIT-licensed as well; they
are installed from their own repositories and remain their authors' work.
