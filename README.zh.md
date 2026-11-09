# dsh-iar-cspy

DeepSeek Harness（DSH）插件包，用于接入官方的
[IAR C-SPY MCP Server](https://github.com/iarsystems/cspy-mcp)。它通过 stdio
连接该服务器、注册 `iar-cspy` 技能，并补齐服务器本身没有的初始化与 launch
配置工具。

装上之后，agent 可以：

- 通过 IAR 自己的 ProjectManager 构建 `.ewp` 工程；
- 从工程和 linker map 生成 C-SPY launch 配置；
- 在模拟器或硬件探针上启动、运行、单步、下断点、观察调试会话；
- 读取目标 printf 输出、内存、寄存器、局部变量和调用栈。

服务器就是官方的 `iar-cspy` + `iar-cspy-mcp`，未做任何修改；插件只负责连接参数、
稳定启动器、初始化脚本和技能内容。

## 前置条件

- Windows（EWARM 只有 Windows 版）。
- IAR Embedded Workbench for Arm 8.40.1 及以上，`common\bin` 下有
  `CSpyServer2.exe` 和 `IarServiceLauncher.exe`。已在 EWARM 9.60.2 上验证。
- Python 3.10+（或给初始化脚本传 `-Python`）。
- Git；若使用本地的两个上游仓库副本则不需要。

## 安装

1. 安装到当前 DSH profile。可以从 npm：

   ```
   plugin_manager install_bundle target=dsh-iar-cspy@1.0.0
   ```

   或者直接装 GitHub Release 的 tgz：

   ```
   plugin_manager install_bundle target=https://github.com/Wazy-XD/dsh-iar-cspy/releases/download/v1.0.0/dsh-iar-cspy-1.0.0.tgz
   ```

2. 初始化私有 Python 环境（只需一次）。初始化脚本就在已安装的插件包里，先找到再运行：

   ```powershell
   $setup = Get-ChildItem "$env:USERPROFILE\.dsh\profiles\*\node_modules\dsh-iar-cspy\scripts\setup.ps1" |
       Select-Object -First 1
   & $setup.FullName -IarPath 'C:\Program Files\IAR Systems\Embedded Workbench 9.60'
   ```

   如果用的是解压后的 Release，直接运行 `scripts\setup.ps1`。

   脚本会：探测 IAR 安装位置、创建 `%LOCALAPPDATA%\dsh-iar-cspy\venv`、安装
   `iar-cspy`/`iar-cspy-mcp`/启动器、写 `config.json`、把辅助脚本复制到
   `%LOCALAPPDATA%\dsh-iar-cspy\bin`，最后跑一遍 doctor。

3. 重新加载插件或新开一个会话，工具会以 `mcp__iar__*` 出现。

## 能力

- 官方服务器的约 83 个工具：会话生命周期、运行控制、断点、表达式求值、寄存器、
  内存、反汇编、调用栈与局部变量、目标 stdin/stdout、工程构建、IDE 服务。
- `iar-cspy` 技能：工具地图、构建/调试流程、launch JSON 写法，以及 9.x 老平台的
  注意事项；任务里出现 IAR 相关词时会自动加载。
- `scripts\iar-launch.ps1`：从 `.ewp` 和 linker map 生成 launch JSON
  （`--cpu`、`--fpu`、端序、semihosting），可用参数覆盖 driver、program 和额外
  driverOptions。

与官方 IAR VS Code 扩展的逐项对照见 [PARITY.md](PARITY.md)。

## EWARM 9.60.2（以及其他 IDE Platform 9.5 之前的版本）

9.60.2 后端报告的是 IAR IDE Platform 9.3.5，缺少若干 ProjectManager 调用，因此这些
官方工具在 9.60.2 上会失败：

| 工具 | 报错 | 替代做法 |
| --- | --- | --- |
| `project_load_workspace`、`project_status` | 无 `HasWorkspace` | 直接带路径调用 `project_build`，或 `projectmanager_call("LoadEwpFile", ...)` |
| `project_get_launch_config`、`project_configure_and_start_debug` | 无 `GetLaunchConfigurationForConfiguration` | `scripts\iar-launch.ps1` + `debugger_configure_and_start_session` |
| `options_*` | 9.60.2 没有 OptionsService | 从 `.ewp` 读选项 |

其余能力——构建、配置、启动、运行控制、断点、观察、目标 IO——都在 9.60.2 上实测过，
包括把自带的 `GettingStarted` 工程在模拟器里完整跑完。

## 排错

**`dsh-iar-cspy is not set up yet`** —— 安装插件后先跑一次
`scripts\setup.ps1`。

**`No usable temporary directory found`** —— venv 或进程带了 Low 完整性标签，通常是
因为建在了沙箱工作区里。重跑 `setup.ps1`（它装在 `%LOCALAPPDATA%`），启动器会把
`TEMP`/`TMP` 固定到可写目录。

**`pip`/`git` 被沙箱拦截** —— 在沙箱外克隆上游仓库，然后给 `setup.ps1` 传
`-CspyPySource` / `-CspyMcpSource`。

**构建超时** —— 本插件已把 MCP 调用超时设为 10 分钟；特别大的工程可再调高 profile
行里的 `toolCallTimeoutMs`。

**硬件探针起不来** —— 探针驱动需要器件描述和参数，例如
`-DriverOptions '--device=STM32F407VG','-p','C:\iar\ewarm-9.60.2\arm\config\debugger\STLink.ddf'`。

## 目录

```
cordis.patch.yml        MCP client 行（stdio，启动器）
index.js                注册 iar-cspy 技能
launcher/               dsh_iar_launcher：应用 config.json 后转交上游
scripts/setup.ps1       创建 venv、写 config.json
scripts/doctor.ps1      诊断
scripts/iar-launch.ps1  launch JSON 生成器
```

## 卸载

`plugin_manager remove_bundle target=dsh-iar-cspy`，再按需删除
`%LOCALAPPDATA%\dsh-iar-cspy`。

## 许可

MIT。上游 `cspy-py` 与 `cspy-mcp` 同样是 MIT；它们从各自仓库安装，版权归原作者。
