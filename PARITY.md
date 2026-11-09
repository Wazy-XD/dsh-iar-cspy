# Parity with the IAR VS Code extensions

Reference environment: Windows 11, EWARM 9.60.2 (IAR IDE Platform 9.3.5.864),
`iarsystems.iar-build` 1.32.3 and `iarsystems.iar-debug` 1.42.4.

The VS Code extensions and this bundle sit on the same substrate: the IAR
`ProjectManager` service for builds, and the C-SPY Thrift backend for debugging.
The official C-SPY MCP server wraps both. This table maps each user-facing
capability to the tool or script that provides it here.

| Capability | IAR VS Code extension | dsh-iar-cspy | Notes |
| --- | --- | --- | --- |
| Choose project/configuration | `iar-config.project-file` / `project-configuration` | read the `.ewp`, or `iar-launch.ps1 -Configuration` | `project_status` works only on newer IDE platforms |
| Build (incremental) | `iar-build: Build` | `project_build(project_path, config_name)` | Verified on 9.60.2 |
| Rebuild all | `iar-build: Rebuild` | `iarbuild.exe <ewp> -build <config>`, then `project_build` | `project_build` maps to `BuildProject` (incremental); `RebuildAllAsync` is asynchronous and not wrapped |
| Clean | `iar-build: Clean` | `iarbuild.exe <ewp> -clean <config>`, or `projectmanager_call("CleanAsync", ...)` | Clean is intentionally left to IAR's own tool to avoid deleting user outputs by hand |
| Build output / errors | Problems panel, output channel | `project_build` envelope `data.output_tail`, `data.succeeded` | A failed build is `ok=false`, not an exception |
| Create launch configuration | launch.json templates with `<CPU-NAME>` / `<FPU-NAME>` placeholders | `scripts\iar-launch.ps1` reads the `.ewp` and linker map | The extension asks the user to fill the placeholders for non-iar-build projects; the script fills them from the build output |
| Start debugging | `iar-debug` session from launch.json | `debugger_configure_and_start_session(launch_json)` | Hand-written JSON required before IDE platform 9.5 (9.60.2) |
| Stop / restart session | Debug toolbar | `debugger_stop_session`, reconfigure | A managed backend restarts on the next start |
| Run / halt / reset | Debug toolbar | `debugger_go`, `debugger_stop`, `debugger_reset`, `debugger_go_and_wait_for_core_state` | |
| Step over / into / out | Debug toolbar | `debugger_step_over`, `debugger_step_into`, `debugger_step_out` | |
| Run to symbol/address | Run to cursor | `breakpoints_set_code` + `debugger_go`, or `stopOnSymbol` | |
| Breakpoints | Breakpoints view | `breakpoints_set_code`, `set_on_source`, `set_on_ule`, `set_data`, `set_log`, `get_all`, `enable`, `remove` | Descriptor categories are chosen by the backend |
| Watchpoints | Breakpoints view | `breakpoints_set_data(access_type=2/3/4)` | |
| Logpoints | Breakpoints view | `breakpoints_set_log` + `debugger_get_log` | |
| Variables / locals / params | Variables view | `contextmanager_get_locals`, `contextmanager_get_parameters`, `symbols_list_visible` | |
| Expression evaluation | Watch / evaluate | `debugger_eval_expression`, `symbols_lookup` | |
| Call stack | Call Stack view | `contextmanager_get_stack`, `contextmanager_get_stack_depth` | |
| Registers | Registers view | `debugger_register_snapshot` | |
| Memory | Memory view | `memory_read`, `memory_write_hex` | |
| Disassembly | Disassembly view | `disassembly_disassemble_range`, `sourcelookup_get_source_ranges` | |
| Target console | Terminal I/O view | `libsupport_get_output`, `libsupport_push_input`, `libsupport_wait_for_input_request` | Requires semihosting or a terminal plugin |
| Trace / list windows | Trace view | `listwindow_*`, `trace_*` | Driver-dependent |
| Flash / download | Launch `download` settings | launch JSON `download.flashLoader` + driver options | No dedicated tool; pass `download` in the launch JSON |
| Multi-core (SMP) | Device-specific | `debugger_configure_and_start_session`, `debugger_get_number_of_cores`, `debugger_get_core_state` | `--multicore_nr_of_cores=N` in driverOptions |
| Project settings UI | `iar-build` settings webview | `options_*` tools on newer platforms; edit `.ewp` on 9.60.2 | 9.60.2 ships no OptionsService, so `options_*` fails there |
| Toolchain detection | `iar-config.toolchain` | `iar-launch.ps1`/`setup.ps1` read `config.json` or `-IarPath` | |
| Licensing / account | `iar-login` | not applicable | The backend uses the locally licensed installation |
| CI / task build | Tasks and problem matchers | `iarbuild.exe` from a shell, or `project_build` | |

## Verified on EWARM 9.60.2

- `project_build` of `GettingStarted\BasicDebugging.ewp` (`Debug`, ARM7TDMI,
  generic.icf): success, `BasicDebugging.out` produced.
- Hand-written launch JSON with `driverOptions = --endian=little --cpu=ARM7TDMI
  --fpu=None --semihosting`: session configured, started, stopped at `main`,
  ran to completion, and printed the firmware's Fibonacci output through
  `libsupport_get_output` (exit code 0).
- Tools that fail on this platform are listed in the README; the skill tells the
  agent to take the documented alternative instead of retrying them.

## Deliberate differences

- The bundle drives its own C-SPY backend, not the IAR IDE window. A session
  started by the agent is not visible in `IarIdePm`.
- The agent sees a JSON envelope per tool call rather than a GUI; build output
  is tailed to keep the context small.
- The VS Code extensions can resolve launch settings through `iar-config` for
  iar-build projects. Here the launch script derives them from the linker map,
  which is what the build actually used.
