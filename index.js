const SKILL = String.raw`# IAR C-SPY debugger

Use this when the task involves IAR Embedded Workbench: an .ewp/.eww project, C-SPY, an ARM, RISC-V
or MSP430 firmware, a build from iarbuild, or debugging on the simulator or a hardware probe.

## Connection

The official IAR C-SPY MCP server is connected under the name "iar": every tool is
mcp__iar__<name>, about 83 tools. It runs from the private environment created by setup.ps1
(%LOCALAPPDATA%\dsh-iar-cspy) and is started automatically with the plugin.

If the mcp__iar__ tools are missing, or every call fails with "not set up yet":

1. %LOCALAPPDATA%\dsh-iar-cspy\bin\doctor.ps1 (or scripts\doctor.ps1 in the package) prints the
   failing check.
2. scripts\setup.ps1 -IarPath <EWARM root> provisions the environment; an existing harness session
   may need a reload or a new session before the tools appear.

## Tool map

- project_*: build, project files/status, launch configuration (see the legacy notes below).
- debugger_*: configure/start/stop a session, go/stop/reset, step over/into/out, wait for a core
  state, expression evaluation, registers, modules, threads, cycle counter, log.
- breakpoints_*: code breakpoints by symbol/source/address, data watchpoints, log breakpoints,
  enable/remove/list.
- contextmanager_*, symbols_*: call stack, locals, parameters, symbol lookup.
- memory_*, disassembly_*, sourcelookup_*: read/write memory, disassemble a range, map an address
  to source.
- libsupport_*: target stdout/stdin (printf/scanf over semihosting or a terminal).
- listwindow_*: trace/list windows when the driver supports tracing.
- ide_services_* and projectmanager_call: escape hatches for IDE services and raw RPC.

## Legacy products: EWARM 9.60.2 and older IDE platforms

The backend of EWARM 9.60.2 reports IAR IDE Platform 9.3.5. Its ProjectManager is older than the
one the MCP server targets, so these tools fail with "Invalid method name":

- project_load_workspace and project_status (no HasWorkspace);
- project_get_launch_config and project_configure_and_start_debug (no
  GetLaunchConfigurationForConfiguration);
- all options_* tools (9.60.2 ships no OptionsService).

What still works, and how to use it:

- Build with project_build(project_path=<absolute .ewp>, config_name="Debug"). It does not need
  project_load_workspace first.
- If a tool insists on a loaded project, call
  projectmanager_call(method="LoadEwpFile", args_json="[\"<absolute .ewp>\", true]").
- Debug with debugger_configure_and_start_session and a hand-written launch JSON. projectPath and
  projectConfiguration are optional there; program, target, driver and driverOptions are required.

The workspaceFolder variable in a launch config resolves to the process working directory, not the
project directory. Always pass absolute paths.

## Build loop

1. project_build(project_path="D:\\work\\app\\app.ewp", config_name="Debug", num_parallel_builds=4,
   max_output_lines=40). A failed build is not an exception: check data.succeeded and read
   data.output_tail.
2. The linker command in data.output_tail contains --cpu= and --fpu=; the map file under the
   configuration's ListPath records the same command line. Use those values for the launch config.
3. Builds of real projects take longer than the default 60 s MCP call timeout; this bundle sets
   toolCallTimeoutMs to 10 minutes. Do not lower it.

## Debug loop

1. Make sure the configuration was built.
2. Generate the launch JSON with the packaged script (recommended):
   %LOCALAPPDATA%\dsh-iar-cspy\bin\iar-launch.ps1 -Project "D:\\work\\app\\app.ewp" -Configuration Debug
   It reads the .ewp output paths, finds the .out, and takes --cpu/--fpu/--endian/--semihosting
   from the linker map. -Driver, -Cpu, -Fpu, -Program and -DriverOptions override the detection;
   -Build runs iarbuild first. The script prints JSON; write it to a file with -OutFile when the
   agent should read it back from disk.
3. debugger_configure_and_start_session(launch_json=<the JSON as a string>). It configures the
   session, starts it, and runs to stopOnSymbol when set (reported as stopOnSymbol /
   stopOnSymbolError).
4. Verify with debugger_session_status and debugger_get_core_state, then inspect with
   debugger_register_snapshot, contextmanager_get_locals/parameters/stack, symbols_lookup,
   debugger_eval_expression, memory_read, disassembly_disassemble_range.
5. Run with debugger_go or debugger_go_and_wait_for_core_state; step with debugger_step_over,
   step_into, step_out. Read target output with libsupport_get_output.
6. debugger_stop_session when the investigation is done. A managed backend is restarted on the
   next start, so a new launch begins from a clean process.

Minimal simulator launch JSON:

{"type":"cspy","request":"launch","name":"sim","target":"arm","program":"D:\\work\\app\\Debug\\Exe\\app.out","driver":"Simulator","driverOptions":["--endian=little","--cpu=Cortex-M3","--fpu=None","--semihosting"],"stopOnSymbol":"main"}

Driver names follow launch.json: Simulator, 64-bit Simulator, I-jet, CMSIS DAP, J-Link/J-Trace,
ST-LINK, GDB Server, TI XDS, and so on. Hardware drivers normally need device options such as
--device=<part> and -p <EWARM>/arm/config/debugger/<driver>.ddf; pass them in driverOptions.

## Breakpoints

- breakpoints_set_code("main") or breakpoints_set_on_source(file, line, column) for a source line.
- breakpoints_set_data(variable, access_type, size) for watchpoints (2 read, 3 write, 4 read/write).
- breakpoints_set_log(location, message) logs and continues; read the lines with debugger_get_log.
- breakpoints_get_all / breakpoints_enable / breakpoints_remove manage them.

## Target console

- libsupport_get_output returns text, hex, exit code and asserts; waiting_for_input says the target
  blocks on stdin.
- libsupport_push_input sends text; libsupport_wait_for_input_request blocks until the target asks.
- Semihosting must be enabled in the launch/driver options for printf to arrive here.

## Safety

- A debug session pauses, resets and programs real hardware. Do not reset, flash or start a session
  on a device the user has not put in a safe state, and stop sessions you opened.
- Hardware drivers with a flash loader program the target; confirm with the user before a first
  flash on an unfamiliar board.
- Keep the user's IAR IDE out of the picture: do not claim the IDE window shows the agent's
  session; this server drives its own C-SPY backend.
`

export const name = 'dsh-iar-cspy'

/**
 * Registers the `iar-cspy` skill when the skill registry is mounted. The MCP connection itself is a
 * separate row (see cordis.patch.yml), so this plugin stays optional and never blocks the connection.
 */
export function apply (ctx) {
    const skills = ctx.get('skills')
    if (!skills || typeof skills.register !== 'function') {
        return
    }
    ctx.effect(() => skills.register({
        name: 'iar-cspy',
        description: 'Drive IAR Embedded Workbench through the official C-SPY MCP server: build an .ewp project, generate a launch configuration, run and inspect a simulator or hardware debug session.',
        whenToUse: 'A task mentions IAR Embedded Workbench, C-SPY, EWARM, an .ewp/.eww project, iarbuild, or debugging firmware on a simulator or probe.',
        source: 'runtime',
        content: SKILL,
        invocation: { modelInvocable: true, userInvocable: true },
    }))
}
