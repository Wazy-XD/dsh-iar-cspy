# dsh-iar-cspy

DeepSeek Harness (DSH) bundle for the official
[IAR C-SPY MCP server](https://github.com/iarsystems/cspy-mcp). It connects the
server over stdio, registers the `iar-cspy` skill, and adds the setup and
launch-configuration tooling the server cannot provide on its own.

With this bundle an agent can:

- build an `.ewp` configuration through IAR's own ProjectManager;
- generate a C-SPY launch configuration from the project and its linker map;
- start, run, step, break and inspect a debug session on the simulator or a
  hardware probe;
- read target `printf` output, memory, registers, locals and the call stack.

The server is the unmodified upstream package (`iar-cspy` + `iar-cspy-mcp`); the
bundle only supplies connection metadata, a stable launcher, setup scripts and
the skill.

## Requirements

- Windows (EWARM is Windows-only).
- IAR Embedded Workbench for Arm 8.40.1 or newer, with `CSpyServer2.exe` and
  `IarServiceLauncher.exe` under `common\bin`. Tested with EWARM 9.60.2.
- Python 3.10+ on `PATH` (or pass `-Python` to the setup script).
- Git, unless you pass local checkouts of the two upstream repositories.

## Install

1. Install the bundle into the current DSH profile. Either from npm:

   ```
   plugin_manager install_bundle target=dsh-iar-cspy@1.0.0
   ```

   or directly from the GitHub release tarball:

   ```
   plugin_manager install_bundle target=https://github.com/Wazy-XD/dsh-iar-cspy/releases/download/v1.0.0/dsh-iar-cspy-1.0.0.tgz
   ```

2. Provision the private Python environment once. The setup script ships inside the
   installed bundle; find it in the profile and run it:

   ```powershell
   $setup = Get-ChildItem "$env:USERPROFILE\.dsh\profiles\*\node_modules\dsh-iar-cspy\scripts\setup.ps1" |
       Select-Object -First 1
   & $setup.FullName -IarPath 'C:\Program Files\IAR Systems\Embedded Workbench 9.60'
   ```

   From an unpacked release, run `scripts\setup.ps1` directly instead.

   The script detects the IAR installation, creates
   `%LOCALAPPDATA%\dsh-iar-cspy\venv`, installs `iar-cspy`, `iar-cspy-mcp` and
   the launcher, writes `config.json`, copies the helper scripts to
   `%LOCALAPPDATA%\dsh-iar-cspy\bin` and runs the doctor.

3. Reload the plugin or start a new session. The tools appear as
   `mcp__iar__*`.

## What the agent gets

- About 83 tools from the official server: session lifecycle, run control,
  breakpoints, expression evaluation, registers, memory, disassembly, stack and
  locals, target stdin/stdout, project build, IDE services.
- The `iar-cspy` skill: tool map, build/debug workflows, launch JSON recipe and
  the 9.x legacy caveats, loaded automatically when the task mentions IAR.
- `scripts\iar-launch.ps1`: builds a launch JSON from the `.ewp` and the linker
  map (`--cpu`, `--fpu`, endianness, semihosting), with overrides for driver,
  program and extra driver options.

See [PARITY.md](PARITY.md) for the command-by-command comparison with the
official IAR VS Code extensions.

## EWARM 9.60.2 (and other pre-9.5 IDE platforms)

The 9.60.2 backend reports IAR IDE Platform 9.3.5 and predates several
ProjectManager calls. These official tools therefore fail on 9.60.2:

| Tool | Failure | Use instead |
| --- | --- | --- |
| `project_load_workspace`, `project_status` | no `HasWorkspace` | `project_build` with an explicit path, or `projectmanager_call("LoadEwpFile", ...)` |
| `project_get_launch_config`, `project_configure_and_start_debug` | no `GetLaunchConfigurationForConfiguration` | `scripts\iar-launch.ps1` + `debugger_configure_and_start_session` |
| `options_*` | no OptionsService in 9.60.2 | read options from the `.ewp` |

Everything else — build, configure, start, run control, breakpoints,
inspection, target I/O — was exercised on 9.60.2, including a full simulator run
of the shipped `GettingStarted` project.

## Troubleshooting

**`dsh-iar-cspy is not set up yet`** — run `scripts\setup.ps1` once after
installing the bundle.

**`No usable temporary directory found`** — the venv or the process inherited a
Low integrity label, typically because it was created inside a sandboxed
workspace. Re-run `setup.ps1` (it installs under `%LOCALAPPDATA%`) and let the
launcher pin `TEMP`/`TMP`.

**`pip`/`git` is blocked by the sandbox** — clone the upstream repositories
outside the sandbox and pass `-CspyPySource` / `-CspyMcpSource` to
`setup.ps1`.

**A build times out** — this bundle raises the MCP call timeout to 10 minutes.
Very large builds may still exceed it; raise `toolCallTimeoutMs` in the profile
row.

**Hardware probe fails to start** — a probe driver needs its device description
and options, for example `-DriverOptions '--device=STM32F407VG','-p','C:\iar\ewarm-9.60.2\arm\config\debugger\STLink.ddf'`.

## Layout

```
cordis.patch.yml        MCP client row (stdio, launcher)
index.js                iar-cspy skill registration
launcher/               dsh_iar_launcher: applies config.json, delegates to upstream
scripts/setup.ps1       provisions the venv and writes config.json
scripts/doctor.ps1      diagnostics
scripts/iar-launch.ps1  launch JSON generator
```

## Uninstall

Remove the bundle with `plugin_manager remove_bundle target=dsh-iar-cspy`, then
delete `%LOCALAPPDATA%\dsh-iar-cspy` if the environment is no longer needed.

## License

MIT. The upstream `cspy-py` and `cspy-mcp` projects are MIT as well; they are
installed from their own repositories and remain their authors' work.
