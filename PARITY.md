# 与 IAR VS Code 扩展的能力对照

参考环境：Windows 11，EWARM 9.60.2（IAR IDE Platform 9.3.5.864），
`iarsystems.iar-build` 1.32.3 与 `iarsystems.iar-debug` 1.42.4。

VS Code 扩展和本插件建立在同一套基础设施上：构建走 IAR 的 `ProjectManager`，
调试走 C-SPY 的 Thrift 后端，官方 C-SPY MCP Server 封装了这两层。下表把每个
用户可见的能力对应到本插件里的工具或脚本。

## 2.0 架构

- `cordis.patch.yml` 向 profile 插入两条 row：
  - `iar-cspy`（`dsh-iar-cspy` Host 插件）：读取 `iarPath`、`mcpPython`、
    `tempDir`、`toolCallTimeoutMs`、`extraArgs`，解析出 MCP 启动命令，通过
    `iarCspyConfig` 服务提供给下一行；同时注册 `iar-cspy` 技能和
    `iar_cspy_status` 工具。
  - `iar-cspy-mcp`（`@deepseek-ai/dsh-mcp-client`）：`serverName: iar`，stdio，
    直接启动 `<mcpPython> -m iar_cspy_mcp --iar-path <iarPath> [extraArgs]`。
    环境中的 `TEMP`/`TMP` 指向 `tempDir`，`toolCallTimeoutMs` 跟随插件配置，
    并开启自动重连（1 秒到 30 秒退避，最多 50 次）。
- 配置入口在 DSH 侧边栏 **Plugins → dsh-iar-cspy → `iar-cspy` 行 → Configure**；
  bundle 详情页的“配置”区只放安装/更新说明。留空字段自动探测：`iarPath` 依次看
  `IAR_INSTALL_PATH`、`%LOCALAPPDATA%\dsh-iar-cspy\config.json` 和常见安装目录；
  `mcpPython` 回退到 `%LOCALAPPDATA%\dsh-iar-cspy\venv\Scripts\python.exe`；
  `tempDir` 回退到 `%LOCALAPPDATA%\dsh-iar-cspy\tmp`。配置页的值优先于
  `config.json`，后者只在 `iarPath` 或 `mcpPython` 留空时参与自动探测。
- 保存配置后插件重新解析设置并自动重载 MCP 连接，不需要重启 DSH。
- MCP 的 Python 环境不由插件安装：`scripts\setup.ps1` 在
  `%LOCALAPPDATA%\dsh-iar-cspy` 下创建私有 venv，安装官方 `iar-cspy` 与
  `iar-cspy-mcp`，并写入 `config.json`；也可以把 `mcpPython` 指向自己的环境。
  这种手动准备方式是 2.0 的有意设计，插件运行时不会执行 `pip`。

## 能力对照

| 能力 | IAR VS Code 扩展 | dsh-iar-cspy 2.0.0 | 说明 |
| --- | --- | --- | --- |
| 选择工程/配置 | `iar-config.project-file` / `project-configuration` | 读取 `.ewp`，或 `iar-launch.ps1 -Configuration` | `project_status` 只在较新的 IDE Platform 上可用 |
| 增量构建 | `iar-build: Build` | `project_build(project_path, config_name)` | 9.60.2 实测 |
| 全量重建 | `iar-build: Rebuild` | `iarbuild.exe <ewp> -build <config>`，再 `project_build` | `project_build` 对应 `BuildProject`（增量）；`RebuildAllAsync` 是异步接口，未封装 |
| 清理 | `iar-build: Clean` | `iarbuild.exe <ewp> -clean <config>`，或 `projectmanager_call("CleanAsync", ...)` | 有意把删除产物的决定留给 IAR 自己的工具 |
| 构建输出/错误 | Problems 面板、输出通道 | `project_build` 返回的 `data.output_tail`、`data.succeeded` | 构建失败是 `ok=false`，不是异常 |
| 生成 launch 配置 | 带 `<CPU-NAME>` / `<FPU-NAME>` 占位的 launch.json 模板 | `scripts\iar-launch.ps1` 读 `.ewp` 和 linker map | VS Code 扩展让用户填占位；脚本从构建输出自动填 |
| 启动调试 | 从 launch.json 启动 `iar-debug` | `debugger_configure_and_start_session(launch_json)` | IDE Platform 9.5 之前（9.60.2）需要手写 JSON |
| 停止/重启会话 | 调试工具栏 | `debugger_stop_session` 后重新配置 | 托管后端在下次启动时重建 |
| 运行/暂停/复位 | 调试工具栏 | `debugger_go`、`debugger_stop`、`debugger_reset`、`debugger_go_and_wait_for_core_state` | |
| 单步跳过/进入/跳出 | 调试工具栏 | `debugger_step_over`、`debugger_step_into`、`debugger_step_out` | |
| 运行到符号/地址 | Run to cursor | `breakpoints_set_code` + `debugger_go`，或 `stopOnSymbol` | |
| 断点 | Breakpoints 视图 | `breakpoints_set_code`、`set_on_source`、`set_on_ule`、`set_data`、`set_log`、`get_all`、`enable`、`remove` | 断点类别由后端选择 |
| 观察点 | Breakpoints 视图 | `breakpoints_set_data(access_type=2/3/4)` | 2 读、3 写、4 读写 |
| 日志点 | Breakpoints 视图 | `breakpoints_set_log` + `debugger_get_log` | |
| 变量/局部/参数 | Variables 视图 | `contextmanager_get_locals`、`get_parameters`、`symbols_list_visible` | |
| 表达式求值 | Watch / evaluate | `debugger_eval_expression`、`symbols_lookup` | |
| 调用栈 | Call Stack 视图 | `contextmanager_get_stack`、`get_stack_depth` | |
| 寄存器 | Registers 视图 | `debugger_register_snapshot` | |
| 内存 | Memory 视图 | `memory_read`、`memory_write_hex` | |
| 反汇编 | Disassembly 视图 | `disassembly_disassemble_range`、`sourcelookup_get_source_ranges` | |
| 目标控制台 | Terminal I/O 视图 | `libsupport_get_output`、`push_input`、`wait_for_input_request` | 需要 semihosting 或终端插件 |
| 跟踪/列表窗口 | Trace 视图 | `listwindow_*`、`trace_*` | 取决于驱动 |
| 烧写/下载 | launch 的 `download` 设置 | launch JSON 的 `download.flashLoader` + driver 选项 | 没有独立工具，在 launch JSON 里传 `download` |
| 多核（SMP） | 器件相关 | `debugger_configure_and_start_session`、`debugger_get_number_of_cores`、`debugger_get_core_state` | driverOptions 里加 `--multicore_nr_of_cores=N` |
| 工程设置 UI | `iar-build` 设置 webview | 较新平台用 `options_*`；9.60.2 直接改 `.ewp` | 9.60.2 没有 OptionsService，`options_*` 会失败 |
| 工具链探测 | `iar-config.toolchain` | 插件配置页/自动探测：`IAR_INSTALL_PATH` → `config.json` → 常见安装目录；`setup.ps1 -IarPath` | 配置页字段优先于 `config.json` |
| 授权/账号 | `iar-login` | 不适用 | 后端使用本机已授权的安装 |
| CI/任务构建 | Tasks 与 problem matchers | 在 shell 里跑 `iarbuild.exe`，或 `project_build` | |

## 在 EWARM 9.60.2 上验证

- `project_build` 构建 `GettingStarted\BasicDebugging.ewp`（`Debug`、ARM7TDMI、
  `generic.icf`）：成功，生成 `BasicDebugging.out`。
- 手写 launch JSON，`driverOptions` 为 `--endian=little --cpu=ARM7TDMI
  --fpu=None --semihosting`：会话配置并启动，停在 `main`，运行到结束，并通过
  `libsupport_get_output` 读到固件的 Fibonacci 输出（退出码 0）。
- 共暴露 83 个 `mcp__iar__*` 工具。在该平台上会失败的工具列在 README 中；
  `iar-cspy` 技能会指引 agent 走文档里的替代路径，而不是反复重试。

## 有意保留的差异

- 插件驱动自己的 C-SPY 后端，不驱动 IAR IDE 窗口。agent 启动的会话不会出现在
  `IarIdePm` 里。
- agent 每次工具调用看到的是一个 JSON envelope，而不是 GUI；构建输出只回传尾部，
  以控制上下文大小。
- VS Code 扩展可以通过 `iar-config` 为 iar-build 工程解析 launch 设置；这里由
  `iar-launch.ps1` 从 linker map 推导，得到的是构建实际使用的参数。
- 插件不实现调试器逻辑：它只解析配置并启动官方 MCP server，所有 C-SPY 操作仍然
  是上游工具；Python 环境也由 `setup.ps1` 手动准备，便于复用现有环境和排查依赖
  问题。
- 配置和重载由 DSH 的插件配置页负责；`config.json` 只是自动探测的兜底记录，
  不与配置页双向同步。
