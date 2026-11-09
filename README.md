# dsh-iar-cspy

[English](README.en.md) | 中文

## 简介

`dsh-iar-cspy` 2.1.0 是 DeepSeek Harness（DSH）的插件包，用来接入官方的
[IAR C-SPY MCP Server](https://github.com/iarsystems/cspy-mcp)。安装后，agent 可以在
对话里编译 IAR Embedded Workbench 的 `.ewp` 工程，在模拟器或硬件探针上启动 C-SPY
调试会话，并查看变量、寄存器、内存、调用栈和目标输出。IAR 安装路径、MCP 使用的
Python、临时目录和调用超时都可以在 DSH 的插件配置页里设置。

上游 Python 包保持原样：`iar-cspy` 与 `iar-cspy-mcp` 由 `scripts\setup.ps1` 装进
`%LOCALAPPDATA%\dsh-iar-cspy` 下的私有 venv。bundle 自己负责两条 DSH 行（Host 插件
`iar-cspy` 和 MCP client 行 `iar-cspy-mcp`）、配置 schema 与配置页、`iar-cspy`
技能，以及 `iar-launch.ps1` 等辅助脚本。插件不会在运行时执行 `pip`。

## 能力

- **83 个官方 MCP 工具**（`mcp__iar__*`）：`project_*` 构建/工程信息，
  `debugger_*` 会话与运行控制，`breakpoints_*` 断点/观察点/日志点，
  `contextmanager_*`、`symbols_*` 栈与符号，`memory_*`、`disassembly_*`、
  `sourcelookup_*` 内存/反汇编/源码定位，`libsupport_*` 目标 stdin/stdout，
  `listwindow_*` 跟踪窗口，以及 `ide_services_*`、`projectmanager_call` 兜底。
- **`iar-cspy` 技能**：用户和模型都可调用；任务涉及 IAR、EWARM、C-SPY、
  `.ewp`/`.eww`、iarbuild 时自动加载。内容包含工具地图、构建与调试流程、
  launch JSON 写法、EWARM 9.60.2 限制和安全注意事项。
- **配置页**：DSH 侧边栏 **Plugins → dsh-iar-cspy**，配置表单在插件页
  组件列表上方；设置 IAR 路径、
  MCP Python、临时目录、超时和额外参数；留空字段自动探测。保存后 MCP 连接自动
  重载，不需要重启 DSH。
- **`iar_cspy_status` 工具**：返回插件实际解析到的 `iarPath`、`mcpPython`、
  `tempDir`、`toolCallTimeoutMs`、`stateDir` 以及缺失项，用于快速判断“为什么
  工具没连上”。
- **`scripts\iar-launch.ps1`**：从 `.ewp` 和 linker map 生成 launch JSON，自动带上
  `--cpu`、`--fpu`、端序和 semihosting，可用参数覆盖 driver、program 和额外
  driverOptions。
- **独立 C-SPY 后端**：会话由插件自己的 MCP 进程驱动，独立于已经打开的
  IAR IDE 窗口。连接断开后按 1 秒到 30 秒退避重连（最多 50 次）；启动失败不会让
  DSH 整体报错。

与官方 IAR VS Code 扩展的逐项对照见 [PARITY.md](PARITY.md)。

## 前置条件

- Windows。IAR 的 C-SPY 后端和 EWARM 只有 Windows 版。
- 已安装 IAR Embedded Workbench for Arm。安装根目录下必须有
  `common\bin\CSpyServer2.exe` 和 `common\bin\IarServiceLauncher.exe`。
  当前在 **EWARM 9.60.2**（IAR IDE Platform 9.3.5）上完整验证过。
- 运行 `scripts\setup.ps1` 需要 Python 3.10+、Git，以及访问 GitHub/PyPI 的网络。
  使用本地源码副本（`-CspyPySource` / `-CspyMcpSource`）时可以跳过 Git；也可以
  完全不用 setup，改用自己的 Python 环境（见下）。
- 私有 venv 和临时目录要放在**非沙箱工作区**的可写位置，默认是
  `%LOCALAPPDATA%\dsh-iar-cspy`。

## 安装与配置

### 1. 安装 bundle

在 DSH 里安装当前版本（GitHub Release 的 tgz）：

```
plugin_manager install_bundle target=https://github.com/Wazy-XD/dsh-iar-cspy/releases/download/v2.1.0/dsh-iar-cspy-2.1.0.tgz
```

也可以用本地 tgz，或等发布到 npm 后用 `target=dsh-iar-cspy@2.1.0`。安装完成后
bundle 会向 profile 插入两条 row：`iar-cspy`（Host 插件）和 `iar-cspy-mcp`
（MCP client）。

### 2. 准备 MCP 的 Python 环境

bundle 只负责启动 MCP，不负责安装 Python 包。先找到已安装包里的 setup 脚本并
运行一次：

```powershell
$setup = Get-ChildItem "$env:USERPROFILE\.dsh\profiles\*\node_modules\dsh-iar-cspy\scripts\setup.ps1" |
    Select-Object -First 1
& $setup.FullName
```

如果没有找到脚本，先确认 bundle 已经安装；也可以从解压后的发布包里直接运行
`scripts\setup.ps1`。

脚本会：

- 探测 IAR 安装（优先 `IAR_INSTALL_PATH`，再扫常见安装目录）；
- 在 `%LOCALAPPDATA%\dsh-iar-cspy\venv` 创建私有 venv；
- 安装 `thriftpy2`、`mcp`，以及官方的 `iar-cspy`、`iar-cspy-mcp`；
- 写入 `config.json`（`iarPath`、`mcpPython`、`tempDir`）；
- 把 `setup.ps1`、`doctor.ps1`、`iar-launch.ps1` 复制到
  `%LOCALAPPDATA%\dsh-iar-cspy\bin`；
- 做一次 `import iar_cspy, iar_cspy_mcp` 自检。

探测不到 IAR 时按提示指定安装根目录：

```powershell
& $setup.FullName -IarPath 'C:\Program Files\IAR Systems\Embedded Workbench 9.60'
```

其他参数：`-Python <python.exe>` 指定 3.10+ 解释器；`-Force` 重建 venv；
`-CspyPySource` / `-CspyMcpSource` 使用本地源码副本，避免 `git clone`。脚本会把
私有环境放在 `%LOCALAPPDATA%` 而不是工作区，原因见[排错](#排错)。

> 如果打算使用自己的 Python 环境，跳过这一步：在下一节把 `mcpPython` 指向该
> 环境的 `python.exe`，并确保里面已经安装了 `iar-cspy` 和 `iar-cspy-mcp`。

### 3. 在 DSH 里配置

打开 DSH 侧边栏的 **Plugins → dsh-iar-cspy**：配置表单在插件页的组件列表
上方，字段直接编辑后点“保存”；页面下方还有安装/更新按钮和说明。各字段：

| 字段 | 作用 | 留空时 |
| --- | --- | --- |
| `iarPath` | IAR 安装根目录（含 `common\bin`） | 依次检查 `IAR_INSTALL_PATH`、`%LOCALAPPDATA%\dsh-iar-cspy\config.json`、常见安装目录；要求两个 exe 都存在 |
| `mcpPython` | 启动 MCP 的 `python.exe` | 先看 `config.json` 的 `mcpPython`，再回退到 `%LOCALAPPDATA%\dsh-iar-cspy\venv\Scripts\python.exe` |
| `tempDir` | MCP 进程的 `TEMP`/`TMP` | `%LOCALAPPDATA%\dsh-iar-cspy\tmp` |
| `toolCallTimeoutMs` | 单次 MCP 工具调用超时（毫秒） | `600000`（10 分钟） |
| `extraArgs` | 追加到 MCP 启动命令末尾的额外参数（配置页里每行一个） | 空 |

bundle 详情页和行配置页都有 **安装 / 更新 MCP** 按钮：点击后宿主会运行
`setup.ps1`，页面显示运行状态和输出末尾；安装完成后插件自动写入
`iarPath`/`mcpPython` 并重连，不需要重启 DSH。按钮下方仍给出等价的手动命令
（带 `-IarPath "<IAR 安装目录>"` 占位），适合在页面之外排错。配置页里的值优先于
`config.json`；`config.json` 只在 `iarPath` 或 `mcpPython` 留空时参与自动探测。

启动命令等价于：

```
<mcpPython> -m iar_cspy_mcp --iar-path <iarPath> [extraArgs]
```

MCP 进程的环境里会把 `TEMP`/`TMP` 设为 `tempDir`，把 `IAR_INSTALL_PATH` 设为
解析后的 `iarPath`。

保存配置后插件会重新解析设置并自动重载 MCP 连接，不需要重启 DSH。若工具列表里
仍没有 `mcp__iar__*`，重新加载插件或新开一个会话。

### 4. 确认

让 agent 调用 `iar_cspy_status`，或在对话里问“IAR 工具连上了吗”。它会报告解析后
的 IAR 路径、Python、临时目录和超时；`configured` 为 true 且
`mcpPythonExists`、`iarExecutables` 都为 true 时，`mcp__iar__*` 就可以用了。

## 使用

### 技能与对话

bundle 注册了 `iar-cspy` 技能，模型和用户都可以调用。任务里出现 IAR、EWARM、
C-SPY、`.ewp`/`.eww`、iarbuild 等词时它会自动加载；你也可以在对话里直接点名
这个技能。技能的内容包括工具地图、构建/调试流程、launch JSON 模板、9.60.2 的
老平台限制和硬件安全提醒。

可以直接这样问：

- “用 IAR 编译并调试 `D:\work\app\app.ewp`，Debug 配置。”
- “在模拟器里跑一下这个工程，停在 `main`，然后把 printf 输出读出来。”
- “这个工程用 J-Link，芯片是 STM32F407VG，帮我生成 launch 配置并启动。”

### 构建

agent 会先加载工程，再调用 `project_build`。9.60.2 上没有可用的
`project_load_workspace`，所以用 `projectmanager_call` 的 `LoadEwpFile`
（每个新的 MCP 后端进程加载一次即可）：

```
projectmanager_call(method="LoadEwpFile", args_json='["D:\work\app\app.ewp", true]')
project_build(project_path="D:\work\app\app.ewp", config_name="Debug", num_parallel_builds=4, max_output_lines=40)
```

较新的 IDE Platform 上第一步可以换成 `project_load_workspace(file_path)`。如果跳过加载直接
构建，9.60.2 的 ProjectManager 会报 `Unknown project`。

构建失败不会抛异常：结果是 `ok=false`，看 `data.succeeded` 和 `data.output_tail`。
真实工程的构建时间经常超过 MCP 默认的 60 秒，所以本插件把
`toolCallTimeoutMs` 默认设为 10 分钟；特别大的工程可以在配置页继续调高。

`project_build` 对应增量的 `BuildProject`。需要全量重建或清理时，用 IAR 自己的
`iarbuild.exe`：

```powershell
& 'C:\Program Files\IAR Systems\Embedded Workbench 9.60\common\bin\iarbuild.exe' `
    'D:\work\app\app.ewp' -build Debug
& 'C:\Program Files\IAR Systems\Embedded Workbench 9.60\common\bin\iarbuild.exe' `
    'D:\work\app\app.ewp' -clean Debug
```

### 调试

推荐流程：

1. 先构建目标配置。
2. 用 `scripts\iar-launch.ps1` 生成 launch JSON（见下一节）。
3. 调用 `debugger_configure_and_start_session(launch_json=<JSON 字符串>)`。设置
   `stopOnSymbol` 时会自动运行到该符号，结果在 `stopOnSymbol` /
   `stopOnSymbolError`。
4. 用 `debugger_session_status`、`debugger_get_core_state` 确认连接；再用
   `debugger_register_snapshot`、`contextmanager_get_locals/parameters/stack`、
   `symbols_lookup`、`debugger_eval_expression`、`memory_read`、
   `disassembly_disassemble_range` 观察。
5. 用 `debugger_go` 或 `debugger_go_and_wait_for_core_state` 运行，用
   `debugger_step_over`、`step_into`、`step_out` 单步；目标输出用
   `libsupport_get_output` 读取。
6. 结束后调用 `debugger_stop_session`。下次启动会重建托管后端，新的会话从干净
   进程开始。

> **硬件安全**：调试会话会暂停、复位甚至烧写真实硬件。第一次在不熟悉的板子上
> 烧写前先确认；自己打开的会话结束时记得关闭。

### launch JSON

`scripts\iar-launch.ps1` 读取 `.ewp` 的输出路径、找到 `.out`，再从 linker map 的
命令行里取 `--cpu`、`--fpu`、端序和 `--semihosting`：

```powershell
& "$env:LOCALAPPDATA\dsh-iar-cspy\bin\iar-launch.ps1" `
    -Project 'D:\work\app\app.ewp' -Configuration Debug
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `-Project` | `.ewp` 路径（必填） |
| `-Configuration` | 配置名；省略时用工程里的第一个 |
| `-Driver` | C-SPY driver，默认 `Simulator` |
| `-Cpu` / `-Fpu` | 覆盖从 linker map 探测到的 CPU/FPU |
| `-Program` | 覆盖 `.out` 路径 |
| `-DriverOptions` | 追加原始 driver 选项，字符串数组 |
| `-StopOnSymbol` | 启动后停在该符号，默认 `main` |
| `-Build` | 生成前先用 `iarbuild.exe` 构建 |
| `-OutFile` | 同时把 JSON 写到文件 |

`-Build` 需要知道 IAR 根目录：脚本会读 `config.json`，也可以用 `-IarPath` 明确
指定。不使用 `-Build` 时，launch JSON 的生成不依赖 IAR 安装路径。

生成的 JSON 形如：

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

脚本输出的 JSON 会包含 `projectPath` 和 `projectConfiguration`；在 9.60.2 上
`debugger_configure_and_start_session` 只要求 `program`、`target`、`driver` 和
`driverOptions`，其余字段可选。

driver 名称沿用 IAR launch.json 的写法：`Simulator`、`64-bit Simulator`、`I-jet`、
`CMSIS DAP`、`J-Link/J-Trace`、`ST-LINK`、`GDB Server`、`TI XDS` 等。硬件探针
通常还需要器件描述和 ddf，脚本不会自动生成，用 `-DriverOptions` 传入，例如：

```powershell
-DriverOptions '--device=STM32F407VG','-p','C:\iar\ewarm-9.60.2\arm\config\debugger\STLink.ddf'
```

launch 配置里的 `workspaceFolder` 变量按**进程工作目录**解析，不是工程目录。
始终传绝对路径，或直接使用脚本生成的 JSON。

## EWARM 9.60.2 限制

EWARM 9.60.2 的后端报告 IAR IDE Platform 9.3.5，比 MCP Server 目标的部分
ProjectManager 接口老。以下官方工具会报 `Invalid method name`，不要反复重试：

| 工具 | 缺少的方法 | 替代做法 |
| --- | --- | --- |
| `project_load_workspace`、`project_status` | `HasWorkspace` | 直接带路径调用 `project_build`；确实需要加载时用 `projectmanager_call(method="LoadEwpFile", args_json='["<绝对 .ewp>", true]')` |
| `project_get_launch_config`、`project_configure_and_start_debug` | `GetLaunchConfigurationForConfiguration` | `scripts\iar-launch.ps1` 生成 JSON，再调 `debugger_configure_and_start_session` |
| `options_*` | 9.60.2 没有 OptionsService | 直接读 `.ewp`，或在本机 IAR IDE 里改 |

其余能力——构建、配置会话、启动、运行控制、断点、变量/寄存器/内存/调用栈、目标
输出——都在 9.60.2 上实测过，包括把自带的 `GettingStarted` 工程在模拟器里完整
跑完，并从 `libsupport_get_output` 读到固件的 printf 输出。

## 排错

**工具列表里没有 `mcp__iar__*`，或调用提示未配置。**
先让 agent 调用 `iar_cspy_status`，它会给出解析后的路径和缺失项。常见原因是没跑
`setup.ps1`，或配置页里的 `mcpPython` 不存在。补跑 setup、检查
**Plugins → dsh-iar-cspy** 的配置表单，保存后等连接重载；必要时重新
加载插件或新开会话。`iar-cspy-mcp` 行设置了 `failOnStartupError: false`，所以
MCP 起不来不会让 DSH 整体崩溃，只会表现为工具缺失或调用失败。

**`No usable temporary directory found`。**
venv 或进程带上了 Low 完整性标签，通常是建在了沙箱工作区里，导致 Python 无法写
`%TEMP%`，CSpyServer2 启动失败。私有 venv 和 `tempDir` 都应放在沙箱工作区之外
（默认 `%LOCALAPPDATA%\dsh-iar-cspy`）。重跑 `setup.ps1`，或在配置页把 `tempDir`
指到一个可写目录；`%LOCALAPPDATA%\dsh-iar-cspy\bin\doctor.ps1` 会做写入探测。

**`pip` 或 `git` 被沙箱拦截。**
在沙箱外的普通 PowerShell 里运行 setup，或者先在别处克隆
[cspy-py](https://github.com/iarsystems/cspy-py) 和
[cspy-mcp](https://github.com/iarsystems/cspy-mcp)，再传
`-CspyPySource` / `-CspyMcpSource`。也可以完全跳过 setup，把 `mcpPython` 指向
一个已经装好 `iar-cspy`、`iar-cspy-mcp` 的环境。

**构建超时。**
本插件默认给 MCP 调用 10 分钟；如果工程仍然超时，在配置页调高
`toolCallTimeoutMs`（例如 `1200000` 表示 20 分钟），保存后重试。

**硬件探针起不来。**
探针 driver 需要器件和 ddf 参数，不会自动生成。用 `-DriverOptions` 或 launch JSON
的 `driverOptions` 传入 `--device=<型号>` 和
`-p <EWARM>\arm\config\debugger\<driver>.ddf`；不同探针（J-Link、ST-LINK、I-jet、
CMSIS DAP）的 ddf 名称不同。第一次烧写前先确认目标板状态。

**setup 报 Python 3.10+ 找不到。**
安装 Python 3.10+ 并确保 `py` 或 `python` 在 `PATH` 上，或用 `-Python` 指定
`python.exe`。

## 目录结构

```
dsh-iar-cspy/
  cordis.patch.yml       插入 iar-cspy（Host 插件）和 iar-cspy-mcp（MCP client）两条 row
  index.js               Host 插件：配置 schema、路径/Python 探测、iarCspyConfig 服务、
                         iar-cspy 技能、iar_cspy_status 工具
  client.js              配置页和安装/更新区块（Web UI）
  locale/zh.json         中文标题、描述、README 入口
  locale/en.json         英文标题、描述、README 入口
  scripts/setup.ps1      创建私有 venv、安装官方 iar-cspy/iar-cspy-mcp、写 config.json
  scripts/doctor.ps1     诊断配置、包和临时目录；-Probe 会启动/停止 CSpyServer2
  scripts/iar-launch.ps1 从 .ewp + linker map 生成 launch JSON
  icon.svg               插件图标
```

运行期状态目录（默认）：

```
%LOCALAPPDATA%\dsh-iar-cspy\
  venv\                  私有 Python 环境
  config.json            自动探测用的路径记录（iarPath/mcpPython 留空时读取）
  tmp\                   MCP/CSpyServer2 的临时目录
  src\                   setup 克隆的上游源码
  bin\                   setup 复制的辅助脚本
```

## 卸载

用 `plugin_manager remove_bundle target=dsh-iar-cspy` 移除 bundle 和它插入的两条
row。若不再需要私有 Python 环境，删除 `%LOCALAPPDATA%\dsh-iar-cspy`。卸载不会动
你的 IAR 安装、工程文件，也不会删除你自己配置的 Python 环境。

## 许可

MIT。上游 `cspy-py` 与 `cspy-mcp` 同样是 MIT 许可，从各自仓库安装，版权归原作者。
