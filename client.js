window.__ModuleLoader__.load({
  id: 'dsh-iar-cspy',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    /** Dictionary namespace owned by this bundle. */
    const NS = 'iarCspySettings'
    /** The bundle's own package name, as the plugin page knows it. */
    const PACKAGE_NAME = 'dsh-iar-cspy'
    /** The row the bundle patch inserts; the row page is the one surface with a form. */
    const ROW_ID = 'iar-cspy'
    /** The key the plugin page uses for a row's own configuration page. */
    const ROW_CONFIG_KEY = `${PACKAGE_NAME}#${ROW_ID}`

    /**
     * The one-line installer shown on the bundle page. It is a display string:
     * the plugin never runs a shell command from the browser.
     */
    const SETUP_COMMAND = '$s = Get-ChildItem "$env:USERPROFILE\\.dsh\\profiles\\*\\node_modules\\dsh-iar-cspy\\scripts\\setup.ps1" | Select-Object -First 1; & $s.FullName -IarPath "<IAR 安装目录>"'
    /** The Host route that runs setup.ps1; same-origin only and JSON-only. */
    const PROVISION_ENDPOINT = '/dsh-iar-cspy/provision'

    /** Simplified Chinese copy; the source of truth for every visible string. */
    const zh = {
      summary: 'IAR 安装路径、MCP Python 与调用超时',
      title: 'IAR C-SPY 调试器',
      intro: '配置 IAR 安装位置、MCP 服务器使用的 Python 和调用超时。留空的字段由插件自动检测。',
      iarPathLabel: 'IAR 安装路径',
      iarPathPlaceholder: '例如 D:\\iar\\ewarm-9.60.2',
      iarPathHint: '包含 common\\bin 的目录。留空时自动探测。',
      mcpPythonLabel: 'MCP Python',
      mcpPythonPlaceholder: '例如 C:\\Users\\<你>\\AppData\\Local\\dsh-iar-cspy\\venv\\Scripts\\python.exe',
      mcpPythonHint: '安装了 iar-cspy-mcp 的 Python。留空时使用 %LOCALAPPDATA%\\dsh-iar-cspy\\venv\\Scripts\\python.exe。',
      timeoutLabel: '工具调用超时（毫秒）',
      timeoutHint: '构建和调试可能很慢，默认 600000（10 分钟）。',
      timeoutInvalid: '请输入正整数，或留空使用默认值。',
      tempDirLabel: '临时目录（可选）',
      tempDirHint: '留空时使用 %LOCALAPPDATA%\\dsh-iar-cspy\\tmp。沙箱工作区里的 Python 需要可写目录。',
      extraArgsLabel: '额外参数（每行一个）',
      extraArgsHint: '传给 iar_cspy_mcp 的额外参数，例如 --no-ide-services。',
      browse: '浏览…',
      save: '保存',
      saving: '保存中…',
      reset: '重置',
      saved: '已保存',
      rejected: '保存被拒绝',
      loading: '正在加载配置…',
      unavailable: '当前无法编辑配置。',
      readOnly: '配置为只读。',
      noFormHint: '这些设置需要在插件的行页面上编辑：在插件列表里打开 dsh-iar-cspy，点 “iar-cspy” 行的“配置”。',
      pickerUnavailable: '当前环境不支持目录选择，请手动填写路径。',
      pickerFailed: '目录选择失败，请手动填写路径。',
      installTitle: '安装或更新 MCP 服务器',
      installText: '插件本身不安装 Python 包。首次使用或需要更新时，运行插件包里的 scripts\\setup.ps1；它会创建独立 venv 并安装官方 iar-cspy 与 iar-cspy-mcp。也可以自己准备 Python 环境，然后在上面的“MCP Python”里填写解释器路径。',
      copyCommand: '复制命令',
      copied: '已复制',
      copyFailed: '无法访问剪贴板，请手动选择命令复制。',
      installNote: '安装完成后回到这里检查路径；配置保存后插件会自动重连，不需要重启 DSH。',
      configTitle: '配置',
      bundleHint: '在下方行 “iar-cspy” 上点击“配置”编辑 IAR 路径、MCP Python、超时等字段。',
      rowInstallHint: 'MCP 的安装/更新见插件详情页的“配置”说明。',
      provisionAction: '安装 / 更新 MCP',
      provisionRunning: '正在安装…',
      provisionDone: '安装完成，插件会自动重连。',
      provisionFailed: '安装未完成：',
      provisionNote: '首次安装会从 PyPI 和 GitHub 下载依赖，可能需要几分钟；请保持 DSH 运行，不要关闭页面。',
      installManual: '手动命令（可选）',
      installOutput: '安装输出（末尾部分）',
    }

    /** English copy, translated faithfully from the Chinese source. */
    const en = {
      summary: 'IAR install path, MCP Python and call timeout',
      title: 'IAR C-SPY debugger',
      intro: 'Configure the IAR installation, the Python used by the MCP server and the call timeout. Leave a field empty to let the plugin detect it.',
      iarPathLabel: 'IAR installation path',
      iarPathPlaceholder: 'e.g. D:\\iar\\ewarm-9.60.2',
      iarPathHint: 'The directory that contains common\\bin. Leave empty to detect it automatically.',
      mcpPythonLabel: 'MCP Python',
      mcpPythonPlaceholder: 'e.g. C:\\Users\\<you>\\AppData\\Local\\dsh-iar-cspy\\venv\\Scripts\\python.exe',
      mcpPythonHint: 'A Python with iar-cspy-mcp installed. Leave empty to use %LOCALAPPDATA%\\dsh-iar-cspy\\venv\\Scripts\\python.exe.',
      timeoutLabel: 'Tool call timeout (ms)',
      timeoutHint: 'Builds and debugging can be slow; the default is 600000 (10 minutes).',
      timeoutInvalid: 'Enter a positive integer, or leave empty to use the default.',
      tempDirLabel: 'Temporary directory (optional)',
      tempDirHint: 'Leave empty to use %LOCALAPPDATA%\\dsh-iar-cspy\\tmp. Python needs a writable directory inside sandboxed workspaces.',
      extraArgsLabel: 'Extra arguments (one per line)',
      extraArgsHint: 'Extra arguments passed to iar_cspy_mcp, for example --no-ide-services.',
      browse: 'Browse…',
      save: 'Save',
      saving: 'Saving…',
      reset: 'Reset',
      saved: 'Saved',
      rejected: 'Save rejected',
      loading: 'Loading configuration…',
      unavailable: 'Configuration is unavailable.',
      readOnly: 'Configuration is read-only.',
      noFormHint: 'Edit these settings on the plugin row page: open dsh-iar-cspy in the plugin list, then click Configure on the "iar-cspy" row.',
      pickerUnavailable: 'Directory picking is unavailable here; type the path instead.',
      pickerFailed: 'Directory picking failed; type the path instead.',
      installTitle: 'Install or update the MCP server',
      installText: 'The plugin does not install Python packages itself. On first use or when an update is needed, run scripts\\setup.ps1 from the plugin package; it creates a private venv and installs the official iar-cspy and iar-cspy-mcp. You can also prepare a Python environment yourself and enter the interpreter path under "MCP Python" above.',
      copyCommand: 'Copy command',
      copied: 'Copied',
      copyFailed: 'The clipboard is unavailable; select the command and copy it manually.',
      installNote: 'After installing, come back here to check the paths; a saved configuration reconnects the plugin automatically, no DSH restart needed.',
      configTitle: 'Configuration',
      bundleHint: 'Click Configure on the "iar-cspy" row below to edit the IAR path, MCP Python, timeout and other fields.',
      rowInstallHint: 'For MCP installation or updates, see the "Configuration" note on the plugin details page.',
      provisionAction: 'Install / update MCP',
      provisionRunning: 'Installing…',
      provisionDone: 'Installed. The plugin reconnects automatically.',
      provisionFailed: 'Installation did not complete:',
      provisionNote: 'The first install downloads dependencies from PyPI and GitHub; this can take a few minutes. Keep DSH running and leave the page open.',
      installManual: 'Manual command (optional)',
      installOutput: 'Install output (tail)',
    }

    const DICTIONARIES = { zh, en }

    /** Last-resort translator: the Chinese map, so copy never renders as a bare key. */
    function fallbackT(key) {
      return Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : key
    }

    function errorText(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** A raw saved value as editable text; anything unexpected reads as empty. */
    function textOf(value) {
      if (typeof value === 'string') return value
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }

    /** The saved config as the page's draft. Never assumes a shape beyond an object. */
    function readValues(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const extraArgs = Array.isArray(source.extraArgs)
        ? source.extraArgs.filter(arg => typeof arg === 'string')
        : []
      return {
        iarPath: textOf(source.iarPath),
        mcpPython: textOf(source.mcpPython),
        tempDir: textOf(source.tempDir),
        toolCallTimeoutMs: textOf(source.toolCallTimeoutMs),
        extraArgsText: extraArgs.join('\n'),
      }
    }

    /** Textarea lines to the array the Host config holds. */
    function parseExtraArgs(text) {
      return String(text === undefined || text === null ? '' : text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '')
    }

    /** Empty is valid (it clears the key and lets the Host default apply). */
    function isValidTimeout(text) {
      const value = String(text === undefined || text === null ? '' : text).trim()
      if (value === '') return true
      if (!/^[0-9]+$/.test(value)) return false
      const numeric = Number(value)
      return Number.isSafeInteger(numeric) && numeric > 0
    }

    /**
     * The writes that turn the saved values into the draft.
     *
     * Only fields whose value actually changed are written, and an empty text
     * clears the key instead of pinning an empty string: that is what lets the
     * Host plugin detect the IAR installation and the Python interpreter.
     */
    function buildOperations(draft, raw) {
      const saved = readValues(raw)
      const operations = []

      const stringField = (key) => {
        const next = draft[key].trim()
        const previous = saved[key].trim()
        if (next === previous) return
        operations.push(next === ''
          ? { op: 'unset', path: [key] }
          : { op: 'set', path: [key], value: next })
      }

      stringField('iarPath')
      stringField('mcpPython')
      stringField('tempDir')

      const timeoutText = draft.toolCallTimeoutMs.trim()
      if (timeoutText !== saved.toolCallTimeoutMs.trim()) {
        operations.push(timeoutText === ''
          ? { op: 'unset', path: ['toolCallTimeoutMs'] }
          : { op: 'set', path: ['toolCallTimeoutMs'], value: Number(timeoutText) })
      }

      const nextArgs = parseExtraArgs(draft.extraArgsText)
      const savedArgs = parseExtraArgs(saved.extraArgsText)
      if (JSON.stringify(nextArgs) !== JSON.stringify(savedArgs)) {
        operations.push(nextArgs.length === 0
          ? { op: 'unset', path: ['extraArgs'] }
          : { op: 'set', path: ['extraArgs'], value: nextArgs })
      }

      return operations
    }

    const styles = {
      summary: {
        fontSize: '13px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      form: {
        display: 'grid',
        gap: '16px',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
      },
      head: { display: 'grid', gap: '8px' },
      title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      intro: {
        margin: 0,
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      field: { display: 'grid', gap: '8px' },
      label: {
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--dsw-alias-label-primary)',
      },
      hint: {
        margin: 0,
        fontSize: '12px',
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        font: 'inherit',
        fontSize: '14px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
      },
      inputInvalid: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        font: 'inherit',
        fontSize: '14px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        borderRadius: '8px',
      },
      textarea: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        font: 'inherit',
        fontFamily: 'var(--dsw-font-mono)',
        fontSize: '13px',
        lineHeight: 1.5,
        minHeight: '84px',
        resize: 'vertical',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
      },
      inputRow: { display: 'flex', gap: '8px', alignItems: 'center' },
      actions: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap',
      },
      primaryButton: {
        font: 'inherit',
        fontSize: '13px',
        padding: '7px 16px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-button-primary-fill)',
        color: 'var(--dsw-alias-label-primary-foreground)',
        cursor: 'pointer',
      },
      primaryButtonDisabled: {
        font: 'inherit',
        fontSize: '13px',
        padding: '7px 16px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-button-primary-fill)',
        color: 'var(--dsw-alias-label-primary-foreground)',
        opacity: 0.5,
        cursor: 'not-allowed',
      },
      secondaryButton: {
        font: 'inherit',
        fontSize: '13px',
        padding: '7px 14px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      status: {
        margin: 0,
        fontSize: '13px',
        color: 'var(--dsw-alias-label-primary)',
      },
      ok: {
        fontSize: '13px',
        color: 'var(--dsw-alias-state-success-primary)',
      },
      error: {
        margin: 0,
        fontSize: '12px',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      errorInline: {
        fontSize: '12px',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      note: {
        margin: 0,
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      card: {
        display: 'grid',
        gap: '12px',
        padding: '16px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      cardTitle: {
        margin: 0,
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      install: { display: 'grid', gap: '8px' },
      installTitle: {
        margin: 0,
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      installText: {
        margin: 0,
        fontSize: '12px',
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      pre: {
        margin: 0,
        padding: '10px 12px',
        fontFamily: 'var(--dsw-font-mono)',
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        overflowX: 'auto',
        whiteSpace: 'pre',
        userSelect: 'text',
      },
      provision: { display: 'grid', gap: '10px' },
      provisionRow: {
        display: 'grid',
        gap: '8px',
        marginTop: '8px',
        paddingTop: '16px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      outputBox: { display: 'grid', gap: '6px' },
      installOutput: {
        margin: 0,
        maxHeight: '220px',
        overflow: 'auto',
        padding: '10px 12px',
        fontFamily: 'var(--dsw-font-mono)',
        fontSize: '11px',
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        userSelect: 'text',
      },
    }

    /** The page's field scaffolding: label above control, hint below. */
    function field(key, label, control, hint, extra) {
      return h('div', { key, style: styles.field }, [
        h('label', {
          key: 'label',
          htmlFor: `dsh-iar-cspy-${key}`,
          style: styles.label,
        }, label),
        control,
        extra === undefined ? null : extra,
        h('p', { key: 'hint', style: styles.hint }, hint),
      ])
    }

    /** The shared install action: POSTs to the Host route that runs setup.ps1. */
    function useProvision() {
      const [state, setState] = useState('idle')
      const [output, setOutput] = useState('')
      const [error, setError] = useState('')
      const [elapsed, setElapsed] = useState(0)

      useEffect(() => {
        if (state !== 'running') return undefined
        const started = Date.now()
        const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
        return () => clearInterval(timer)
      }, [state])

      const run = async (iarPath) => {
        if (state === 'running') return
        setState('running')
        setOutput('')
        setError('')
        setElapsed(0)
        try {
          const response = await fetch(PROVISION_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ iarPath: typeof iarPath === 'string' ? iarPath.trim() : '' }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) {
            setState('failed')
            setError(String(payload.error || ('HTTP ' + response.status)))
            setOutput(typeof payload.output === 'string' ? payload.output : '')
            return
          }
          setState('done')
          setOutput(typeof payload.output === 'string' ? payload.output : '')
        } catch (error) {
          setState('failed')
          setError(errorText(error))
        }
      }
      return { state, output, error, elapsed, run }
    }

    function ProvisionControls(props) {
      const t = props.t || fallbackT
      const provision = useProvision()
      const busy = provision.state === 'running'
      return h('div', { style: styles.provision }, [
        h('div', { key: 'actions', style: styles.actions }, [
          h('button', {
            key: 'run',
            type: 'button',
            style: busy ? styles.primaryButtonDisabled : styles.primaryButton,
            disabled: busy,
            onClick: () => { void provision.run(props.iarPath) },
          }, busy ? `${t('provisionRunning')} ${provision.elapsed}s` : t('provisionAction')),
        ]),
        provision.state === 'done'
          ? h('p', { key: 'done', style: styles.ok, role: 'status' }, t('provisionDone'))
          : null,
        provision.state === 'failed'
          ? h('p', { key: 'failed', style: styles.error, role: 'status' }, `${t('provisionFailed')}${provision.error === '' ? '' : ' ' + provision.error}`)
          : null,
        busy ? h('p', { key: 'note', style: styles.hint }, t('provisionNote')) : null,
        provision.output === ''
          ? null
          : h('div', { key: 'output', style: styles.outputBox }, [
              h('p', { key: 'label', style: styles.hint }, t('installOutput')),
              h('pre', { key: 'pre', style: styles.installOutput }, provision.output.slice(-4000)),
            ]),
      ])
    }

    /** The bundle detail card: where to configure, and how to install the server. */
    function IarDetailSection(props) {
      const subject = props.subject
      if (subject === null || typeof subject !== 'object') return null
      if (subject.kind !== 'bundle') return null
      if (subject.pkg === null || typeof subject.pkg !== 'object') return null
      if (subject.pkg.name !== PACKAGE_NAME) return null
      const t = props.t || fallbackT
      return h('section', {
        style: styles.card,
        'data-dsh-iar-cspy-config': 'true',
      }, [
        h('h4', { key: 'title', style: styles.cardTitle }, t('configTitle')),
        h('p', { key: 'hint', style: styles.hint }, t('bundleHint')),
        h(InstallSection, { key: 'install', t }),
      ])
    }

    /** The install/update instructions with the copyable setup command. */
    function InstallSection(props) {
      const t = props.t || fallbackT
      const [copyState, setCopyState] = useState('')

      useEffect(() => {
        if (copyState !== 'copied') return undefined
        const timer = setTimeout(() => setCopyState(''), 2000)
        return () => clearTimeout(timer)
      }, [copyState])

      const copy = async () => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (!clipboard || typeof clipboard.writeText !== 'function') {
          setCopyState('failed')
          return
        }
        try {
          await clipboard.writeText(SETUP_COMMAND)
          setCopyState('copied')
        } catch {
          setCopyState('failed')
        }
      }

      return h('div', { style: styles.install }, [
        h('h5', { key: 'title', style: styles.installTitle }, t('installTitle')),
        h('p', { key: 'text', style: styles.installText }, t('installText')),
        h(ProvisionControls, { key: 'provision', t }),
        h('p', { key: 'manual', style: styles.hint }, t('installManual')),
        h('pre', { key: 'command', style: styles.pre }, SETUP_COMMAND),
        h('div', { key: 'actions', style: styles.actions }, [
          h('button', {
            key: 'copy',
            type: 'button',
            style: styles.secondaryButton,
            onClick: () => { void copy() },
          }, t('copyCommand')),
          copyState === 'copied'
            ? h('span', { key: 'copied', style: styles.ok, role: 'status' }, t('copied'))
            : null,
          copyState === 'failed'
            ? h('span', { key: 'failed', style: styles.errorInline, role: 'status' }, t('copyFailed'))
            : null,
        ]),
        h('p', { key: 'note', style: styles.hint }, t('installNote')),
      ])
    }

    /**
     * The row's configuration page.
     *
     * The row page is the one native slot that hands a component a writable
     * `form`; the bundle page only gets a summary, so it is not registered here.
     * `view: 'summary'` renders the one-liner the row list uses.
     */
    function IarRowConfig(props) {
      const t = props.t || fallbackT
      if (props.view === 'summary') {
        return h('span', { style: styles.summary }, t('summary'))
      }
      return h(IarSettingsPage, { ...props, t })
    }

    /** The editable page. Hooks stay unconditional; `form` may arrive later. */
    function IarSettingsPage(props) {
      const form = props.form
      const t = props.t || fallbackT
      const pickDirectory = props.pickDirectory

      const [draft, setDraft] = useState(() => readValues(form && form.state ? form.state.value : {}))
      const [baseline, setBaseline] = useState(() => (form && form.state && form.state.value) || {})
      const [revision, setRevision] = useState(() => (form && form.state ? form.state.revision : undefined))
      const [dirty, setDirty] = useState(false)
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState('')
      const [pickerMessage, setPickerMessage] = useState('')

      // A Host reload may adopt new saved values, but never over a draft the
      // operator is still editing.
      useEffect(() => {
        if (dirty) return
        const value = (form && form.state && form.state.value) || {}
        setDraft(readValues(value))
        setBaseline(value)
        setRevision(form && form.state ? form.state.revision : undefined)
      }, [form && form.state ? form.state.revision : undefined, form && form.state ? form.state.status : undefined, dirty])

      if (!form || !form.state) {
        return h('p', { style: styles.note, role: 'status' }, t('noFormHint'))
      }
      if (form.state.status !== 'ready') {
        return h('p', {
          style: styles.note,
          role: 'status',
        }, t(form.state.status === 'loading' ? 'loading' : 'unavailable'))
      }

      const readOnly = form.state.writable === false
      const disabled = busy || readOnly
      const operations = buildOperations(draft, baseline)
      const isDirty = operations.length > 0
      const timeoutValid = isValidTimeout(draft.toolCallTimeoutMs)
      const currentRevision = revision === undefined ? form.state.revision : revision
      const canSave = !busy && !readOnly && isDirty && timeoutValid

      const edit = (key, value) => {
        setDraft(current => ({ ...current, [key]: value }))
        setDirty(true)
        setMessage('')
        setPickerMessage('')
      }

      const reset = () => {
        const value = (form.state && form.state.value) || {}
        setDraft(readValues(value))
        setBaseline(value)
        setRevision(form.state ? form.state.revision : undefined)
        setDirty(false)
        setMessage('')
        setPickerMessage('')
      }

      const save = async (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        if (!canSave) return
        const pending = buildOperations(draft, baseline)
        if (pending.length === 0) return
        setBusy(true)
        setMessage('')
        try {
          const accepted = await form.mutate(pending, currentRevision)
          setMessage(t(accepted ? 'saved' : 'rejected'))
          if (accepted) setDirty(false)
        } catch (error) {
          setMessage(errorText(error))
        } finally {
          setBusy(false)
        }
      }

      const browse = async (key) => {
        if (typeof pickDirectory !== 'function') {
          setPickerMessage(t('pickerUnavailable'))
          return
        }
        setPickerMessage('')
        try {
          const picked = await pickDirectory()
          if (typeof picked === 'string' && picked.trim() !== '') edit(key, picked)
        } catch {
          setPickerMessage(t('pickerFailed'))
        }
      }

      const textInput = (key, placeholder) => h('input', {
        key: 'control',
        id: `dsh-iar-cspy-${key}`,
        type: 'text',
        style: styles.input,
        value: draft[key],
        placeholder,
        disabled,
        spellCheck: false,
        onChange: event => edit(key, event.target.value),
      })

      const browseRow = (key, placeholder) => h('div', { key: 'control', style: styles.inputRow }, [
        textInput(key, placeholder),
        h('button', {
          key: 'browse',
          type: 'button',
          style: styles.secondaryButton,
          disabled,
          onClick: () => { void browse(key) },
        }, t('browse')),
      ])

      return h('form', {
        style: styles.form,
        onSubmit: event => { void save(event) },
      }, [
        h('div', { key: 'head', style: styles.head }, [
          h('h3', { key: 'title', style: styles.title }, t('title')),
          h('p', { key: 'intro', style: styles.intro }, t('intro')),
        ]),
        field('iarPath', t('iarPathLabel'), browseRow('iarPath', t('iarPathPlaceholder')), t('iarPathHint')),
        field('mcpPython', t('mcpPythonLabel'), browseRow('mcpPython', t('mcpPythonPlaceholder')), t('mcpPythonHint')),
        field('toolCallTimeoutMs', t('timeoutLabel'), h('input', {
          key: 'control',
          id: 'dsh-iar-cspy-toolCallTimeoutMs',
          type: 'text',
          inputMode: 'numeric',
          style: timeoutValid ? styles.input : styles.inputInvalid,
          value: draft.toolCallTimeoutMs,
          disabled,
          spellCheck: false,
          'aria-invalid': timeoutValid ? undefined : true,
          onChange: event => edit('toolCallTimeoutMs', event.target.value),
        }), t('timeoutHint'), timeoutValid ? null : h('p', {
          key: 'invalid',
          style: styles.error,
          role: 'status',
        }, t('timeoutInvalid'))),
        field('tempDir', t('tempDirLabel'), textInput('tempDir'), t('tempDirHint')),
        field('extraArgs', t('extraArgsLabel'), h('textarea', {
          key: 'control',
          id: 'dsh-iar-cspy-extraArgs',
          style: styles.textarea,
          rows: 4,
          value: draft.extraArgsText,
          disabled,
          spellCheck: false,
          onChange: event => edit('extraArgsText', event.target.value),
        }), t('extraArgsHint')),
        pickerMessage === '' ? null : h('p', {
          key: 'picker',
          style: styles.note,
          role: 'status',
        }, pickerMessage),
        readOnly ? h('p', { key: 'readonly', style: styles.note, role: 'status' }, t('readOnly')) : null,
        h('div', { key: 'actions', style: styles.actions }, [
          h('button', {
            key: 'save',
            type: 'submit',
            style: canSave ? styles.primaryButton : styles.primaryButtonDisabled,
            disabled: !canSave,
          }, t(busy ? 'saving' : 'save')),
          h('button', {
            key: 'reset',
            type: 'button',
            style: styles.secondaryButton,
            disabled: busy,
            onClick: reset,
          }, t('reset')),
        ]),
        message === '' ? null : h('p', {
          key: 'message',
          style: styles.status,
          role: 'status',
        }, message),
        h('div', { key: 'provision', style: styles.provisionRow }, [
          h('p', { key: 'title', style: styles.installTitle }, t('installTitle')),
          h(ProvisionControls, { key: 'controls', t, iarPath: draft.iarPath }),
        ]),
        h('p', { key: 'install-link', style: styles.hint }, t('rowInstallHint')),
      ])
    }

    /**
     * Register the row's configuration page and the bundle page's install card.
     *
     * `uiWorkspace` is optional (and may mount after this plugin), so the picker
     * is resolved once here and simply absent when the service is missing.
     */
    function apply(ctx) {
      let t = fallbackT

      if (ctx.locale && typeof ctx.locale.register === 'function') {
        ctx.effect(
          () => ctx.locale.register(NS, DICTIONARIES),
          'dsh-iar-cspy: settings dictionaries',
        )
        if (typeof ctx.locale.bind === 'function') {
          const bound = ctx.locale.bind(NS)
          if (typeof bound === 'function') t = bound
        }
      }

      let pickDirectory
      try {
        const uiWorkspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
        if (uiWorkspace && typeof uiWorkspace.pickDirectory === 'function') {
          pickDirectory = () => uiWorkspace.pickDirectory()
        }
      } catch {
        pickDirectory = undefined
      }

      ctx.slots.inject('plugins.row.config', () => {
        const dispose = ctx.slots.register({
          name: 'plugins.row.config',
          key: ROW_CONFIG_KEY,
          locale: NS,
        }, props => h(IarRowConfig, { ...props, t, pickDirectory }))
        return typeof dispose === 'function' ? dispose : () => {}
      })

      ctx.slots.inject('plugins.detail.section', () => {
        const dispose = ctx.slots.register({
          name: 'plugins.detail.section',
          id: 'dsh-iar-cspy.config',
          order: 40,
          locale: NS,
        }, props => h(IarDetailSection, { ...props, t }))
        return typeof dispose === 'function' ? dispose : () => {}
      })
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
