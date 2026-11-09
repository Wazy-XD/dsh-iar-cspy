import z from '@deepseek-ai/schemastery'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-iar-cspy'

const IS_WINDOWS = process.platform === 'win32'
const STATE_DIR = process.env.DSH_IAR_CSPY_HOME
  || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'dsh-iar-cspy') : join(process.env.HOME || process.env.USERPROFILE || '.', '.dsh-iar-cspy'))
const SETUP_SCRIPT = fileURLToPath(new URL('./scripts/setup.ps1', import.meta.url))
const PROVISION_PATH = '/dsh-iar-cspy/provision'
const CONFIG_PATH = '/dsh-iar-cspy/config'

export const Config = z.object({
  iarPath: z.string().default(''),
  mcpPython: z.string().default(''),
  tempDir: z.string().default(''),
  toolCallTimeoutMs: z.number().default(600000),
  extraArgs: z.array(z.string()).default([]),
})

function setupConfig () {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, 'config.json'), 'utf8'))
  } catch {
    return {}
  }
}

function isIarRoot (root) {
  return Boolean(root)
    && existsSync(join(root, 'common', 'bin', 'CSpyServer2.exe'))
    && existsSync(join(root, 'common', 'bin', 'IarServiceLauncher.exe'))
}

function detectIarPath () {
  const setup = setupConfig()
  const candidates = [process.env.IAR_INSTALL_PATH, setup.iarPath]
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const roots = [
    programFiles ? join(programFiles, 'IAR Systems') : '',
    programFilesX86 ? join(programFilesX86, 'IAR Systems') : '',
    'C:\\iar',
    'C:\\IAR',
    'D:\\iar',
    'D:\\IAR',
  ]
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(join(root, entry.name))
      }
    } catch {}
  }
  const found = candidates.filter(candidate => isIarRoot(candidate))
  found.sort((left, right) => right.localeCompare(left))
  return found[0] || ''
}

function detectMcpPython () {
  const setup = setupConfig()
  const candidates = [setup.mcpPython, join(STATE_DIR, 'venv', 'Scripts', 'python.exe')]
  return candidates.find(candidate => candidate && existsSync(candidate)) || ''
}

function resolveSettings (config) {
  const iarPath = String(config?.iarPath || '').trim() || detectIarPath()
  const mcpPython = String(config?.mcpPython || '').trim() || detectMcpPython()
  const tempDir = String(config?.tempDir || '').trim() || join(STATE_DIR, 'tmp')
  const rawTimeout = Number(config?.toolCallTimeoutMs)
  const timeout = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.min(Math.floor(rawTimeout), 86400000) : 600000
  const extraArgs = Array.isArray(config?.extraArgs) ? config.extraArgs.filter(arg => typeof arg === 'string' && arg.length > 0) : []

  const env = { TEMP: tempDir, TMP: tempDir }
  if (iarPath) env.IAR_INSTALL_PATH = iarPath

  let command
  let args
  if (mcpPython && existsSync(mcpPython)) {
    command = mcpPython
    args = ['-m', 'iar_cspy_mcp']
    if (iarPath) args.push('--iar-path', iarPath)
    args.push(...extraArgs)
  } else if (IS_WINDOWS) {
    command = 'C:\\Windows\\System32\\cmd.exe'
    args = ['/d', '/c', 'echo dsh-iar-cspy: MCP Python is not configured, open Plugins -> dsh-iar-cspy -> settings 1>&2 & exit 1']
  } else {
    command = '/bin/sh'
    args = ['-c', 'echo "dsh-iar-cspy: MCP Python is not configured, open Plugins -> dsh-iar-cspy -> settings" 1>&2; exit 1']
  }

  return {
    command,
    args,
    env,
    timeout,
    configured: Boolean(mcpPython && iarPath),
    iarPath,
    mcpPython,
    tempDir,
    extraArgs,
  }
}

const SKILL = String.raw`# IAR C-SPY 调试器

当任务涉及 IAR Embedded Workbench（EWARM）、C-SPY、.ewp/.eww 工程、iarbuild、ARM/RISC-V/MSP430
固件，或者需要在模拟器/硬件探针上编译、下载、调试时，使用本技能。

## 入口与连接

官方 IAR C-SPY MCP Server 以 MCP 名称 "iar" 接入，工具形如 mcp__iar__*，共 83 个。
插件设置里可以配置 IAR 安装路径、MCP 使用的 Python、临时目录和调用超时；留空时自动检测：

- IAR 路径：先看环境变量 IAR_INSTALL_PATH，再读 %LOCALAPPDATA%\dsh-iar-cspy\config.json，
  最后扫描常见安装目录（需要 common\bin\CSpyServer2.exe 和 IarServiceLauncher.exe）。
- MCP Python：%LOCALAPPDATA%\dsh-iar-cspy\venv\Scripts\python.exe。
- 临时目录：%LOCALAPPDATA%\dsh-iar-cspy\tmp。
- 超时默认 600000 毫秒（10 分钟），因为真实工程构建经常超过 60 秒。

如果 mcp__iar__* 工具不存在，先调用 iar_cspy_status 查看解析后的路径和缺失项；再让用户到
DSH 侧边栏 Plugins -> dsh-iar-cspy 的配置表单检查路径（在插件页组件列表上方）。配置页有
“安装 / 更新 MCP”按钮，点击后宿主运行 setup.ps1、显示输出并自动重连；也可以手动运行
插件包内的 scripts\setup.ps1。插件本身不安装 Python 包。用户也可以直接在对话输入
/iar-cspy 调用本技能。

## 工具地图

- project_*：构建工程、工程文件/状态、launch 配置（老平台限制见下）。
- debugger_*：配置/启动/停止会话，运行/暂停/复位，单步，等待核状态，表达式求值，寄存器，
  模块，线程，周期计数，调试日志。
- breakpoints_*：按符号/源码行/地址下代码断点，数据观察点，日志断点，启用/删除/列表。
- contextmanager_*、symbols_*：调用栈、局部变量、参数、符号查找。
- memory_*、disassembly_*、sourcelookup_*：读写内存、反汇编、地址映射到源码。
- libsupport_*：目标 stdout/stdin（semihosting 或终端 printf/scanf）。
- listwindow_*：支持 trace 的驱动上的跟踪/列表窗口。
- ide_services_*、projectmanager_call：IDE 服务和原始 RPC 的兜底入口。

## EWARM 9.60.2 等老平台（IAR IDE Platform 9.5 之前）

9.60.2 后端报告 IAR IDE Platform 9.3.5，缺少以下 ProjectManager 方法，这些工具会报
"Invalid method name"，不要反复重试：

- project_load_workspace、project_status：缺 HasWorkspace。
- project_get_launch_config、project_configure_and_start_debug：缺
  GetLaunchConfigurationForConfiguration。
- options_*：9.60.2 没有 OptionsService。

可用的替代路径：

- 直接 project_build(project_path=<绝对 .ewp>, config_name="Debug")，不需要先 load。
- 如果某个工具坚持要先加载工程：
  projectmanager_call(method="LoadEwpFile", args_json="[\"<绝对 .ewp>\", true]")。
- 调试用 debugger_configure_and_start_session + 手写 launch JSON；program、target、driver、
  driverOptions 四个字段必填。

launch 配置里的 workspaceFolder 变量按进程工作目录解析，不是工程目录；始终传绝对路径。

## 构建流程

1. project_build(project_path=绝对路径, config_name="Debug", num_parallel_builds=4,
   max_output_lines=40)。构建失败不会抛异常：看 data.succeeded 和 data.output_tail。
2. data.output_tail 里的链接命令包含 --cpu= 和 --fpu=；配置 ListPath 下的 .map 文件也记录了
   同样的命令行。这两个值就是 launch JSON 要用的 CPU/FPU。
3. 大工程构建慢，插件已把 toolCallTimeoutMs 设为 10 分钟，不要调低。

## 调试流程

1. 确认配置已构建。
2. 生成 launch JSON（推荐）：
   %LOCALAPPDATA%\dsh-iar-cspy\bin\iar-launch.ps1 -Project "D:\work\app\app.ewp" -Configuration Debug
   脚本读取 .ewp 的输出路径、找到 .out，并从 link map 取 --cpu/--fpu/端序/semihosting。
   可用 -Driver、-Cpu、-Fpu、-Program、-DriverOptions 覆盖；-Build 会先跑 iarbuild。
   需要文件时加 -OutFile。
3. debugger_configure_and_start_session(launch_json=<JSON 字符串>)。设置 stopOnSymbol 时会
   自动运行到该符号（结果在 stopOnSymbol / stopOnSymbolError）。
4. 用 debugger_session_status、debugger_get_core_state 确认状态；再用
   debugger_register_snapshot、contextmanager_get_locals/parameters/stack、symbols_lookup、
   debugger_eval_expression、memory_read、disassembly_disassemble_range 观察。
5. 运行用 debugger_go 或 debugger_go_and_wait_for_core_state；单步用 debugger_step_over、
   step_into、step_out。目标输出用 libsupport_get_output 读。
6. 结束用 debugger_stop_session。托管后端会在下次启动时重建，新的 launch 从干净进程开始。

最小模拟器 launch JSON：

{"type":"cspy","request":"launch","name":"sim","target":"arm","program":"D:\\work\\app\\Debug\\Exe\\app.out","driver":"Simulator","driverOptions":["--endian=little","--cpu=Cortex-M3","--fpu=None","--semihosting"],"stopOnSymbol":"main"}

driver 名称沿用 launch.json：Simulator、64-bit Simulator、I-jet、CMSIS DAP、J-Link/J-Trace、
ST-LINK、GDB Server、TI XDS 等。硬件探针通常还需要 --device=<型号> 和
-p <EWARM>\arm\config\debugger\<驱动>.ddf，放进 driverOptions。

## 断点

- breakpoints_set_code("main") 或 breakpoints_set_on_source(file, line, column) 下源码断点。
- breakpoints_set_data(variable, access_type, size) 下观察点（2 读、3 写、4 读写）。
- breakpoints_set_log(location, message) 打印后继续；用 debugger_get_log 读日志。
- breakpoints_get_all / breakpoints_enable / breakpoints_remove 管理断点。

## 目标控制台

- libsupport_get_output 返回文本、十六进制、退出码和断言；waiting_for_input 表示目标在等 stdin。
- libsupport_push_input 发送文本；libsupport_wait_for_input_request 等到目标请求输入。
- printf 走 semihosting 或终端插件，launch/driver 选项里要相应打开。

## 安全

- 调试会话会暂停、复位、烧写真实硬件。不要在用户没有准备好的设备上复位、烧写或启动会话；
  自己开的会话结束时要关闭。
- 带 flash loader 的硬件驱动会真正写目标；第一次在不熟悉的板子上烧写前先向用户确认。
- 这是独立的 C-SPY 后端，不会出现在用户的 IAR IDE 窗口里，不要声称 IDE 里能看到调试会话。
`

function readJsonBody (req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function runSetup (iarPath) {
  return new Promise(resolve => {
    if (!existsSync(SETUP_SCRIPT)) {
      resolve({ ok: false, output: 'setup.ps1 not found at ' + SETUP_SCRIPT })
      return
    }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const command = existsSync(powershell) ? powershell : 'powershell.exe'
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SETUP_SCRIPT]
    if (iarPath) args.push('-IarPath', iarPath)
    let child
    try {
      mkdirSync(STATE_DIR, { recursive: true })
      child = spawn(command, args, { cwd: STATE_DIR, windowsHide: true })
    } catch (error) {
      resolve({ ok: false, output: String(error) })
      return
    }
    let output = ''
    const append = chunk => {
      output += chunk.toString('utf8')
      if (output.length > 400000) output = output.slice(-400000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
    }, 15 * 60 * 1000)
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ ok: false, output: output + '\n' + String(error) })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ ok: code === 0, exitCode: code, output })
    })
  })
}

async function syncConfigFromSetup (ctx) {
  const setup = setupConfig()
  if (!setup.mcpPython && !setup.iarPath) return
  const editor = ctx.get('configEditor')
  const entry = editor && typeof editor.entries === 'function'
    ? editor.entries().find(item => String(item.id) === 'include:iar-cspy')
    : undefined
  if (!editor || !entry) return
  const current = entry.options.config || {}
  const next = { ...current }
  let changed = false
  if (setup.iarPath && setup.iarPath !== current.iarPath) {
    next.iarPath = setup.iarPath
    changed = true
  }
  if (setup.mcpPython && setup.mcpPython !== current.mcpPython) {
    next.mcpPython = setup.mcpPython
    changed = true
  }
  if (!changed) return
  try {
    await editor.edit(entry, () => next)
  } catch {}
}

function currentConfigEntry (ctx) {
  const editor = ctx.get('configEditor')
  const entry = editor && typeof editor.entries === 'function'
    ? editor.entries().find(item => String(item.id) === 'include:iar-cspy')
    : undefined
  return { editor, entry }
}

function configSnapshot (ctx) {
  const { entry } = currentConfigEntry(ctx)
  const value = entry && entry.options && entry.options.config ? entry.options.config : {}
  const settings = resolveSettings(value)
  return {
    value,
    effective: {
      iarPath: settings.iarPath,
      mcpPython: settings.mcpPython,
      tempDir: settings.tempDir,
      toolCallTimeoutMs: settings.timeout,
      extraArgs: settings.extraArgs,
    },
    configured: settings.configured,
    revision: Date.now(),
  }
}

function applyConfigOps (current, ops) {
  const allowed = new Set(['iarPath', 'mcpPython', 'tempDir', 'toolCallTimeoutMs', 'extraArgs'])
  const next = { ...current }
  for (const op of Array.isArray(ops) ? ops : []) {
    const path = Array.isArray(op && op.path) ? op.path : []
    if (path.length !== 1 || !allowed.has(path[0])) throw new Error('unsupported configuration path')
    const key = path[0]
    if (op.op === 'unset') {
      delete next[key]
      continue
    }
    if (op.op !== 'set') throw new Error('unsupported configuration operation')
    if (key === 'toolCallTimeoutMs') {
      const value = Number(op.value)
      if (!Number.isFinite(value) || value <= 0) throw new Error('toolCallTimeoutMs must be a positive number')
      next[key] = Math.floor(value)
    } else if (key === 'extraArgs') {
      if (!Array.isArray(op.value)) throw new Error('extraArgs must be an array')
      next[key] = op.value.filter(item => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
    } else {
      if (typeof op.value !== 'string') throw new Error(key + ' must be a string')
      next[key] = op.value.trim()
    }
  }
  return next
}

function registerRoutes (ctx) {
  const web = ctx.get('webServer')
  if (!web || typeof web.register !== 'function') return

  const respond = (res, status, payload) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  const admit = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      respond(res, 405, { ok: false, error: 'GET or POST only' })
      return false
    }
    const origin = req.headers.origin
    if (origin) {
      let sameOrigin = false
      try { sameOrigin = new URL(origin).host === req.headers.host } catch {}
      if (!sameOrigin) {
        respond(res, 403, { ok: false, error: 'cross-origin request rejected' })
        return false
      }
    }
    if (req.method === 'POST') {
      const type = String(req.headers['content-type'] || '')
      if (!type.includes('application/json')) {
        respond(res, 415, { ok: false, error: 'application/json required' })
        return false
      }
    }
    return true
  }

  ctx.effect(() => web.register({
    kind: 'exact',
    path: CONFIG_PATH,
    async handler (req, res) {
      if (!admit(req, res)) return
      try {
        if (req.method === 'GET') {
          respond(res, 200, { ok: true, ...configSnapshot(ctx) })
          return
        }
        const payload = JSON.parse((await readJsonBody(req)) || '{}')
        const { editor, entry } = currentConfigEntry(ctx)
        if (!editor || !entry) throw new Error('configuration entry is not addressable')
        const next = applyConfigOps(entry.options.config || {}, payload.ops)
        await editor.edit(entry, () => next)
        respond(res, 200, { ok: true, ...configSnapshot(ctx) })
      } catch (error) {
        respond(res, 400, { ok: false, error: String(error) })
      }
    },
  }), 'dsh-iar-cspy: config route')

  ctx.effect(() => web.register({
    kind: 'exact',
    path: PROVISION_PATH,
    async handler (req, res) {
      if (!admit(req, res)) return
      if (req.method !== 'POST') {
        respond(res, 405, { ok: false, error: 'POST only' })
        return
      }
      try {
        const payload = JSON.parse((await readJsonBody(req)) || '{}')
        const iarPath = typeof payload.iarPath === 'string' ? payload.iarPath.trim() : ''
        const result = await runSetup(iarPath)
        const setup = setupConfig()
        respond(res, result.ok ? 200 : 500, {
          ok: result.ok,
          exitCode: result.exitCode ?? null,
          output: String(result.output || '').slice(-12000),
          mcpPython: setup.mcpPython || '',
          iarPath: setup.iarPath || '',
        })
        if (result.ok) {
          setTimeout(() => { void syncConfigFromSetup(ctx) }, 200)
        }
      } catch (error) {
        respond(res, 500, { ok: false, error: String(error) })
      }
    },
  }), 'dsh-iar-cspy: provision route')
}

function statusOf (settings) {
  const setup = setupConfig()
  return {
    configured: settings.configured,
    iarPath: settings.iarPath || '',
    iarPathSource: settings.iarPath
      ? (String(setup.iarPath || '') === settings.iarPath ? 'setup-config' : 'detected')
      : 'missing',
    iarExecutables: settings.iarPath ? isIarRoot(settings.iarPath) : false,
    mcpPython: settings.mcpPython || '',
    mcpPythonExists: Boolean(settings.mcpPython && existsSync(settings.mcpPython)),
    tempDir: settings.tempDir,
    toolCallTimeoutMs: settings.timeout,
    extraArgs: settings.extraArgs,
    stateDir: STATE_DIR,
    hint: settings.configured
      ? 'Configuration looks usable. The MCP tools are mcp__iar__*.'
      : 'Open DSH sidebar Plugins -> dsh-iar-cspy; the configuration form is on the plugin page above the component list. Or run scripts/setup.ps1 from the plugin package.',
  }
}

export function apply (ctx, config) {
  const settings = resolveSettings(config)
  const service = {
    command: settings.command,
    args: settings.args,
    env: settings.env,
    timeout: settings.timeout,
  }
  ctx.provide('iarCspyConfig', service)
  registerRoutes(ctx)

  const skills = ctx.get('skills')
  if (skills && typeof skills.register === 'function') {
    ctx.effect(() => skills.register({
      name: 'iar-cspy',
      description: '通过官方 IAR C-SPY MCP Server 编译和调试 IAR Embedded Workbench 工程：构建 .ewp、生成 launch 配置、启动模拟器或硬件调试、查看变量/寄存器/内存/目标输出。',
      whenToUse: '任务涉及 IAR Embedded Workbench、C-SPY、EWARM、.ewp/.eww 工程、iarbuild，或需要编译/调试 ARM、RISC-V、MSP430 固件。',
      source: 'runtime',
      content: SKILL,
      invocation: { modelInvocable: true, userInvocable: true },
    }))
  }

  const tools = ctx.get('tools')
  if (tools && typeof tools.register === 'function') {
    ctx.effect(() => tools.register({
      name: 'iar_cspy_status',
      description: 'Report how the dsh-iar-cspy plugin resolved the IAR installation, MCP Python and timeout, and what is missing.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
            iarPath: { type: 'string' },
            iarPathSource: { type: 'string' },
            iarExecutables: { type: 'boolean' },
            mcpPython: { type: 'string' },
            mcpPythonExists: { type: 'boolean' },
            tempDir: { type: 'string' },
            toolCallTimeoutMs: { type: 'number' },
            extraArgs: { type: 'array', items: { type: 'string' } },
            stateDir: { type: 'string' },
            hint: { type: 'string' },
          },
          required: ['configured', 'tempDir', 'toolCallTimeoutMs', 'stateDir', 'hint'],
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      execute: async () => statusOf(settings),
    }))
  }
}
