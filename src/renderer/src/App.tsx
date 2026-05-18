import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCog } from '@fortawesome/free-solid-svg-icons'
import type { ChatAttachment, ChatMessage, LlmModelOption } from './api/client'
import {
  fetchLlmModels,
  streamAgentFromPython,
} from './api/enterprise'
import type { AgentEvent } from './agent/types'
import { ActivityBar } from './components/ActivityBar'
import { WechatLoginModal } from './components/WechatLoginModal'
import type { WechatUser } from './components/WechatLoginModal'
import { AiChatSidebar } from './components/AiChatSidebar'
import { EditorArea } from './components/EditorArea'
import type { EditorSelectionPayload, EditorTab } from './components/EditorArea'
import { FileExplorer } from './components/FileExplorer'
import { SearchPanel } from './components/SearchPanel'
import type { FileNode } from './components/FileExplorer'
import { StatusBar } from './components/StatusBar'
import { TerminalPanel } from './components/TerminalPanel'
import { ToastContainer, useToast } from './components/Toast'
import { SettingsPanel, DEFAULT_EDITOR_OPTIONS } from './components/SettingsPanel'
import type { EditorOptions } from './components/SettingsPanel'

const MODEL_PATH_STORAGE_KEY = 'private-rag-gguf-path'
const API_KEY_STORAGE_KEY = 'private-rag-header-api-key'
const BASE_URL_STORAGE_KEY = 'private-rag-llm-base-url'
const LEGACY_AUTH_TOKEN_STORAGE_KEY = 'private-rag-header-token'
const EDITOR_OPTIONS_STORAGE_KEY = 'private-rag-editor-options'
const DISABLED_MODELS_STORAGE_KEY = 'private-rag-disabled-models'
const WECHAT_USER_STORAGE_KEY = 'isshin-wechat-user'
const WECHAT_STATE_STORAGE_KEY = 'isshin-wechat-state'

type ActiveSection = 'explorer' | 'search' | 'chat'

export default function App() {
  // ── Editor state ──────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<ActiveSection>('explorer')
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(220)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorOptions, setEditorOptions] = useState<EditorOptions>(DEFAULT_EDITOR_OPTIONS)

  // ── WeChat auth ────────────────────────────────────────────────
  const [wechatLoginOpen, setWechatLoginOpen] = useState(false)
  const [wechatUser, setWechatUser] = useState<WechatUser | null>(null)
  const [wechatSessionState, setWechatSessionState] = useState('')

  // ── Toast ─────────────────────────────────────────────────────
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast()

  // ── Chat state ────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [llmModels, setLlmModels] = useState<LlmModelOption[]>([])
  const [selectedModelPath, setSelectedModelPath] = useState('')
  const [disabledModelPaths, setDisabledModelPaths] = useState<string[]>([])
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)

  // ── Warnings → Toast ─────────────────────────────────────────
  const prevWarningsLen = useRef(0)
  useEffect(() => {
    const newOnes = warnings.slice(prevWarningsLen.current)
    newOnes.forEach((w) => pushToast(w, 'error'))
    prevWarningsLen.current = warnings.length
  }, [warnings, pushToast])

  // ── Persistence ───────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY)
      setBaseUrl(localStorage.getItem(BASE_URL_STORAGE_KEY) ?? '')
      setApiKey(localStorage.getItem(API_KEY_STORAGE_KEY) ?? '')
      setSelectedModelPath(localStorage.getItem(MODEL_PATH_STORAGE_KEY) ?? '')

      // Restore WeChat session
      const savedUser = localStorage.getItem(WECHAT_USER_STORAGE_KEY)
      const savedState = localStorage.getItem(WECHAT_STATE_STORAGE_KEY)
      if (savedUser) {
        try {
          setWechatUser(JSON.parse(savedUser) as WechatUser)
          setWechatSessionState(savedState ?? '')
        } catch { /* ignore malformed */ }
      }
      const editorStored = localStorage.getItem(EDITOR_OPTIONS_STORAGE_KEY)
      if (editorStored) {
        try {
          setEditorOptions({ ...DEFAULT_EDITOR_OPTIONS, ...JSON.parse(editorStored) })
        } catch { /* ignore malformed */ }
      }
      const disabledStored = localStorage.getItem(DISABLED_MODELS_STORAGE_KEY)
      if (disabledStored) {
        try {
          setDisabledModelPaths(JSON.parse(disabledStored) as string[])
        } catch { /* ignore malformed */ }
      }
    } catch { /* ignore */ }
  }, [])

  // ── 模型列表（Nexus API，依赖 api_key）───────────────────────────
  const applyModelListResult = useCallback(
    (mRes: PromiseSettledResult<Awaited<ReturnType<typeof fetchLlmModels>>>) => {
      if (mRes.status === 'fulfilled') {
        const raw = mRes.value
        const models: LlmModelOption[] = raw.map((r) => ({
          path: r.path,
          label: r.label,
          active: r.active,
        }))
        setLlmModels(models)
        setSelectedModelPath((prev) => {
          if (models.length === 0) {
            return prev
          }
          let next = ''
          if (prev && models.some((m) => m.path === prev)) {
            next = prev
          } else {
            try {
              const stored = localStorage.getItem(MODEL_PATH_STORAGE_KEY)
              if (stored && models.some((m) => m.path === stored)) next = stored
            } catch { /* ignore */ }
            if (!next) next = models[0].path
          }
          try {
            if (next) localStorage.setItem(MODEL_PATH_STORAGE_KEY, next)
            else localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
          } catch { /* ignore */ }
          return next
        })
      } else {
        setLlmModels([])
      }
    },
    [],
  )

  const loadLlmModels = useCallback(
    async (key: string) => {
      const mRes = await Promise.allSettled([fetchLlmModels(key.trim())])
      applyModelListResult(mRes[0])
    },
    [applyModelListResult],
  )

  useEffect(() => {
    const key = apiKey.trim()
    if (!key) {
      setLlmModels([])
      return
    }
    const id = window.setTimeout(() => {
      void loadLlmModels(apiKey)
    }, 400)
    return () => window.clearTimeout(id)
  }, [apiKey, loadLlmModels])

  // ── Settings handlers ─────────────────────────────────────────
  const handleBaseUrlChange = useCallback((v: string) => {
    setBaseUrl(v)
    try { localStorage.setItem(BASE_URL_STORAGE_KEY, v) } catch { /* ignore */ }
  }, [])

  const handleApiKeyChange = useCallback((v: string) => {
    setApiKey(v)
    try { localStorage.setItem(API_KEY_STORAGE_KEY, v) } catch { /* ignore */ }
  }, [])

  const handleEditorOptionsChange = useCallback((opts: EditorOptions) => {
    setEditorOptions(opts)
    try { localStorage.setItem(EDITOR_OPTIONS_STORAGE_KEY, JSON.stringify(opts)) } catch { /* ignore */ }
  }, [])

  const handleModelPathChange = useCallback((v: string) => {
    setSelectedModelPath(v)
    try {
      const t = v.trim()
      if (t) localStorage.setItem(MODEL_PATH_STORAGE_KEY, t)
      else localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
    } catch { /* ignore */ }
  }, [])

  const handleEnabledModelsChange = useCallback((enabledPaths: string[]) => {
    const disabled = llmModels.map((m) => m.path).filter((p) => !enabledPaths.includes(p))
    setDisabledModelPaths(disabled)
    try { localStorage.setItem(DISABLED_MODELS_STORAGE_KEY, JSON.stringify(disabled)) } catch { /* ignore */ }
  }, [llmModels])

  const handleRefreshModels = useCallback(() => {
    if (apiKey.trim()) void loadLlmModels(apiKey)
  }, [apiKey, loadLlmModels])

  // ── Folder / file open ────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const picked = await invoke<string | null>('open_folder_dialog')
      if (!picked) return
      const tree = await invoke<FileNode[]>('read_dir_tree', { path: picked })
      setFolderPath(picked)
      setFileTree(tree)
      // 关闭所有已打开的 tab
      setTabs([])
      setActiveTabId(null)
      setActiveFileId(null)
    } catch (e) {
      pushToast(e instanceof Error ? e.message : '打开文件夹失败', 'error')
    }
  }, [pushToast])

  // ── Editor handlers ───────────────────────────────────────────
  const handleFileClick = useCallback(async (node: FileNode) => {
    setActiveFileId(node.id)
    if (tabs.some((t) => t.id === node.id)) {
      setActiveTabId(node.id)
      return
    }
    try {
      const content = await invoke<string>('read_file_content', { path: node.id })
      const tab: EditorTab = { id: node.id, name: node.name, ext: node.ext, content }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(node.id)
    } catch {
      // 二进制或超大文件：只激活，不打开 tab
      pushToast(`无法打开 ${node.name}（二进制或文件过大）`, 'error')
    }
  }, [tabs, pushToast])

  const handleTabClose = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) {
        const nextTab = next[idx] ?? next[idx - 1] ?? null
        setActiveTabId(nextTab?.id ?? null)
        setActiveFileId(nextTab?.id ?? null)
      }
      return next
    })
  }, [activeTabId])

  const handleContentChange = useCallback((id: string, value: string) => {
    setTabs((prev) =>
      prev.map((t) => t.id === id ? { ...t, content: value, isDirty: true } : t),
    )
  }, [])

  // ── Stream control ────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamAbortRef.current?.abort()
  }, [])

  // ── Editor → Chat：把选中代码加入下一条对话 ───────────────────────────
  const handleAddSelectionToChat = useCallback(
    (payload: EditorSelectionPayload) => {
      const att: ChatAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filePath: payload.filePath,
        fileName: payload.fileName,
        language: payload.language,
        startLine: payload.startLine,
        endLine: payload.endLine,
        code: payload.code,
      }
      setPendingAttachments((prev) => [...prev, att])
      setActiveSection('chat')
      setShowSidebar(true)
      pushToast(
        `已加入对话：${payload.fileName} L${payload.startLine}-${payload.endLine}`,
        'info',
      )
    },
    [pushToast],
  )

  const handleRemovePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // ── write_file 事件处理：Python agent 写入文件时同步到编辑器（不落盘） ──
  // 进入 pendingAgentEdit 状态，等用户在编辑器 banner 上接受/拒绝。
  const handleWriteFile = useCallback((path: string, content: string) => {
    setTabs((prev) => {
      const exists = prev.find((t) => t.id === path || t.name === path)
      if (exists) {
        return prev.map((t) => {
          if (t.id !== path && t.name !== path) return t
          // 第一次进入 pending 时锁住基线，后续 agent 多次写入不覆盖基线
          const baseline = t.pendingAgentEdit
            ? t.originalContent ?? ''
            : t.content
          return {
            ...t,
            content,
            isDirty: true,
            originalContent: baseline,
            pendingAgentEdit: true,
          }
        })
      }
      const ext = path.split('.').pop() ?? ''
      return [
        ...prev,
        {
          id: path,
          name: path.split('/').pop() ?? path,
          ext,
          content,
          isDirty: true,
          originalContent: '',
          pendingAgentEdit: true,
        },
      ]
    })
    setActiveTabId(path)
  }, [])

  // ── 持久化当前 tab → 真正写到磁盘 ────────────────────────────────────
  // 既覆盖普通 ⌘S 保存，也用作「接受 agent 修改」的实际落盘
  const tabsRef = useRef<EditorTab[]>([])
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  const saveTabToDisk = useCallback(
    async (id: string) => {
      const tab = tabsRef.current.find((t) => t.id === id)
      if (!tab) return
      // 仅允许绝对路径落盘（来自打开文件夹/文件树）；agent 编造的相对路径会被 Rust 端拒绝
      try {
        await invoke('write_file_to_disk', {
          path: id,
          content: tab.content,
          createDirs: true,
        })
        setTabs((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  isDirty: false,
                  pendingAgentEdit: false,
                  originalContent: undefined,
                }
              : t,
          ),
        )
        pushToast(`已保存 ${tab.name}`, 'info')
      } catch (e) {
        pushToast(e instanceof Error ? e.message : '保存失败', 'error')
      }
    },
    [pushToast],
  )

  const acceptAgentEdit = useCallback(
    (id: string) => {
      void saveTabToDisk(id)
    },
    [saveTabToDisk],
  )

  const rejectAgentEdit = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        return {
          ...t,
          content: t.originalContent ?? t.content,
          isDirty: false,
          pendingAgentEdit: false,
          originalContent: undefined,
        }
      }),
    )
  }, [])

  // 拼出发给 LLM 的 user_message：先附加代码片段，再跟用户文本。
  // 用户气泡中只显示原始 text + 上方 chips，模型则能看到完整代码上下文。
  const buildUserMessageForLlm = useCallback(
    (text: string, atts: ChatAttachment[]): string => {
      if (atts.length === 0) return text
      const blocks = atts.map((a, i) => {
        const header = `[附加代码 ${i + 1}] ${a.filePath} (L${a.startLine}-L${a.endLine})`
        const fence = a.language?.trim() || ''
        return `${header}\n\`\`\`${fence}\n${a.code}\n\`\`\``
      })
      const ctx = blocks.join('\n\n')
      return text.trim() ? `${ctx}\n\n${text}` : ctx
    },
    [],
  )

  // ── Agent runner（调用 Python FastAPI 后端）────────────────────────
  const runAgentStream = useCallback(
    async (text: string, history: ChatMessage[], attachments: ChatAttachment[] = []) => {
      setStreaming(true)
      setWarnings([])
      const ac = new AbortController()
      streamAbortRef.current = ac

      const agentSteps: import('./api/client').AgentStep[] = []

      // 将当前所有 editor tab 内容打包发给 Python 后端
      const filesSnapshot: Record<string, string> = {}
      tabs.forEach((t) => { filesSnapshot[t.id] = t.content })
      const activeFilePath = tabs.find((t) => t.id === activeTabId)?.id ?? null

      // 历史中的 user 消息也要把当时附带的代码片段展开给模型
      const llmHistory = history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content:
          m.role === 'user'
            ? buildUserMessageForLlm(m.content, m.attachments ?? [])
            : m.content,
      }))

      const llmUserMessage = buildUserMessageForLlm(text, attachments)

      try {
        if (!baseUrl.trim()) throw new Error('请填写 baseUrl')
        if (!selectedModelPath.trim()) throw new Error('请选择或填写模型标识（model）')
        if (!apiKey.trim()) throw new Error('请填写 api_key')

        await streamAgentFromPython(
          {
            userMessage: llmUserMessage,
            history: llmHistory,
            files: filesSnapshot,
            activeFile: activeFilePath,
            model: selectedModelPath,
            baseUrl,
            apiKey,
            signal: ac.signal,
          },
          {
            onStep: (event: AgentEvent) => {
              if (event.type !== 'tool_call' && event.type !== 'tool_result') return
              agentSteps.push({
                type: event.type,
                label: event.label,
                content: event.content,
                toolName: event.toolName,
              })
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, agentSteps: [...agentSteps] }
                }
                return next
              })
            },
            onWriteFile: handleWriteFile,
            onToken: (token) => {
              // flushSync 强制 React 18 跳过自动批量更新，每个 token 立即触发一次渲染
              flushSync(() => {
                setMessages((m) => {
                  const next = [...m]
                  const last = next[next.length - 1]
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      content: last.content + token,
                      agentSteps: [...agentSteps],
                    }
                  }
                  return next
                })
              })
            },
            onDone: () => {
              streamAbortRef.current = null
              setStreaming(false)
            },
            onError: (msg) => {
              setWarnings((w) => [...w, msg])
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === 'assistant' && !last.content) {
                  next[next.length - 1] = {
                    role: 'assistant',
                    content: `（错误）${msg}`,
                    agentSteps: [...agentSteps],
                  }
                }
                return next
              })
              streamAbortRef.current = null
              setStreaming(false)
            },
          },
        )
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        if (aborted) {
          setMessages((m) => {
            const next = [...m]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              const cur = last.content.trim()
              next[next.length - 1] = {
                ...last,
                content: cur ? `${cur}\n\n（已停止生成）` : '（已停止生成）',
                agentSteps: [...agentSteps],
              }
            }
            return next
          })
        } else {
          const msg = e instanceof Error ? e.message : '请求失败'
          setWarnings((w) => [...w, msg])
        }
        streamAbortRef.current = null
        setStreaming(false)
      }
    },
    [baseUrl, apiKey, selectedModelPath, tabs, activeTabId, handleWriteFile, buildUserMessageForLlm],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    const atts = pendingAttachments
    if ((!text && atts.length === 0) || streaming) return
    setInput('')
    setPendingAttachments([])
    const history = [...messages]
    setMessages((m) => [
      ...m,
      { role: 'user', content: text, attachments: atts.length > 0 ? atts : undefined },
      { role: 'assistant', content: '' },
    ])
    await runAgentStream(text, history, atts)
  }, [input, streaming, messages, pendingAttachments, runAgentStream])

  const regenerateAt = useCallback(
    async (assistantIndex: number) => {
      if (streaming) return
      const m = messages
      if (m[assistantIndex]?.role !== 'assistant') return
      const userPair = m[assistantIndex - 1]
      if (!userPair || userPair.role !== 'user') return
      const history = m.slice(0, assistantIndex - 1)
      const text = userPair.content
      const atts = userPair.attachments ?? []
      setMessages([...m.slice(0, assistantIndex), { role: 'assistant', content: '' }])
      await runAgentStream(text, history, atts)
    },
    [streaming, messages, runAgentStream],
  )

  const submitUserEdit = useCallback(
    async (userIndex: number, newText: string) => {
      const text = newText.trim()
      if (!text || streaming) return
      const history = messages.slice(0, userIndex)
      const original = messages[userIndex]
      const atts = original?.role === 'user' ? original.attachments ?? [] : []
      setMessages([
        ...messages.slice(0, userIndex),
        { role: 'user', content: text, attachments: atts.length > 0 ? atts : undefined },
        { role: 'assistant', content: '' },
      ])
      await runAgentStream(text, history, atts)
    },
    [streaming, messages, runAgentStream],
  )

  // ── Active tab language for status bar ────────────────────────
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const EXT_LANGUAGE: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript',
    jsx: 'JavaScript React', json: 'JSON', md: 'Markdown',
    css: 'CSS', html: 'HTML', py: 'Python', rs: 'Rust', toml: 'TOML',
  }
  const language = activeTab?.ext ? (EXT_LANGUAGE[activeTab.ext] ?? 'Plain Text') : 'Plain Text'

  const showSidePanel = activeSection === 'explorer' || activeSection === 'search'
  const finalShowSidePanel = showSidebar && showSidePanel

  // ── Resizable panels ──────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(340)
  const dragState = useRef<{ side: 'left' | 'right' | 'bottom'; startX: number; startY: number; startWidth: number } | null>(null)

  const startDrag = useCallback((side: 'left' | 'right' | 'bottom', e: ReactMouseEvent) => {
    e.preventDefault()
    dragState.current = {
      side,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: side === 'left' ? leftWidth : side === 'right' ? rightWidth : terminalHeight,
    }
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!dragState.current) return
      if (dragState.current.side === 'left') {
        const delta = ev.clientX - dragState.current.startX
        setLeftWidth(Math.max(140, Math.min(480, dragState.current.startWidth + delta)))
      } else if (dragState.current.side === 'right') {
        const delta = ev.clientX - dragState.current.startX
        setRightWidth(Math.max(220, Math.min(600, dragState.current.startWidth - delta)))
      } else {
        const delta = ev.clientY - dragState.current.startY
        setTerminalHeight(Math.max(80, Math.min(600, dragState.current.startWidth - delta)))
      }
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [leftWidth, rightWidth, terminalHeight])

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      {/* Title bar */}
      <div
        className="relative flex h-8 shrink-0 items-center justify-center bg-[#181818] border-b border-[#3c3c3c] select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[12px] text-[#cccccc] opacity-70">
          {activeTab ? `${activeTab.name} — Isshin AI Code Editor` : 'Isshin AI Code Editor'}
        </span>
        <div
          className="absolute right-2 flex items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 切换左侧目录 */}
          <button
            type="button"
            title={showSidebar ? '隐藏资源管理器' : '显示资源管理器'}
            onClick={() => setShowSidebar((v) => !v)}
            className={[
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              showSidebar
                ? 'text-[#cccccc] hover:bg-[#3c3c3c]'
                : 'text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]',
            ].join(' ')}
          >
            <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor">
              <rect x="0.6" y="0.6" width="12.8" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="0.6" y="0.6" width="4.2" height="10.8" rx="1.2"/>
              <line x1="4.8" y1="0.6" x2="4.8" y2="11.4" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
            </svg>
          </button>

          {/* 切换底部终端 */}
          <button
            type="button"
            title={showTerminal ? '隐藏终端' : '显示终端'}
            onClick={() => setShowTerminal((v) => !v)}
            className={[
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              showTerminal
                ? 'text-[#cccccc] hover:bg-[#3c3c3c]'
                : 'text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]',
            ].join(' ')}
          >
            <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor">
              <rect x="0.6" y="0.6" width="12.8" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="0.6" y="6.8" width="12.8" height="4.6" rx="1.2"/>
              <line x1="0.6" y1="6.8" x2="13.4" y2="6.8" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
            </svg>
          </button>

          {/* 设置 */}
          <button
            type="button"
            title="设置"
            onClick={() => setSettingsOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faCog} className="text-[12px]" />
          </button>
        </div>
      </div>

      {/* Main body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Activity bar */}
        <ActivityBar
          activeSection={activeSection}
          onSectionChange={(s) => {
            if (s === 'chat') {
              setActiveSection(s)
            } else {
              setActiveSection((prev) => (prev === s && showSidePanel ? 'chat' : s))
            }
          }}
          currentUser={wechatUser}
          onAccountClick={() => setWechatLoginOpen(true)}
          onLogout={() => {
            // Remove session from backend (fire-and-forget)
            if (wechatSessionState) {
              fetch(`http://127.0.0.1:8788/auth/wechat/session/${wechatSessionState}`, {
                method: 'DELETE',
              }).catch(() => {})
            }
            setWechatUser(null)
            setWechatSessionState('')
            localStorage.removeItem(WECHAT_USER_STORAGE_KEY)
            localStorage.removeItem(WECHAT_STATE_STORAGE_KEY)
          }}
        />

        {/* WeChat login modal */}
        <WechatLoginModal
          open={wechatLoginOpen}
          agentBaseUrl="http://127.0.0.1:8788"
          onClose={() => setWechatLoginOpen(false)}
          onLoginSuccess={(user, state) => {
            setWechatUser(user)
            setWechatSessionState(state)
            setWechatLoginOpen(false)
            try {
              localStorage.setItem(WECHAT_USER_STORAGE_KEY, JSON.stringify(user))
              localStorage.setItem(WECHAT_STATE_STORAGE_KEY, state)
            } catch { /* ignore */ }
          }}
        />

        {/* Side panel */}
        {finalShowSidePanel && (
          <>
            <div className="shrink-0 overflow-hidden" style={{ width: leftWidth }}>
              {activeSection === 'search' ? (
                <SearchPanel
                  folderPath={folderPath}
                  onOpenFolder={handleOpenFolder}
                  onOpenResult={(path) => {
                    const name = path.split(/[/\\]/).pop() ?? path
                    const ext = name.includes('.') ? name.split('.').pop() : undefined
                    void handleFileClick({ id: path, name, type: 'file', ext })
                  }}
                />
              ) : (
                <FileExplorer
                  tree={fileTree}
                  folderName={folderPath ? folderPath.split('/').pop() ?? folderPath : null}
                  activeFileId={activeFileId}
                  onFileClick={handleFileClick}
                  onOpenFolder={handleOpenFolder}
                />
              )}
            </div>
            {/* Left resize handle */}
            <div
              className="group relative z-10 w-[4px] shrink-0 cursor-col-resize bg-transparent hover:bg-[#0078d4]/40 active:bg-[#0078d4]/60 transition-colors"
              onMouseDown={(e) => startDrag('left', e)}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#3c3c3c] group-hover:bg-[#0078d4]/60 transition-colors" />
            </div>
          </>
        )}

        {/* Editor area + Terminal（竖向堆叠，宽度与编辑区一致）*/}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <EditorArea
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={(id) => {
              setActiveTabId(id)
              setActiveFileId(id)
            }}
            onTabClose={handleTabClose}
            onContentChange={handleContentChange}
            onAddSelectionToChat={handleAddSelectionToChat}
            onSaveTab={saveTabToDisk}
            onAcceptAgentEdit={acceptAgentEdit}
            onRejectAgentEdit={rejectAgentEdit}
            editorOptions={editorOptions}
          />

          {showTerminal && (
            <>
              {/* 上下拖拽分割线 */}
              <div
                className="group relative z-10 h-[4px] shrink-0 cursor-row-resize bg-transparent hover:bg-[#0078d4]/40 active:bg-[#0078d4]/60 transition-colors"
                onMouseDown={(e) => startDrag('bottom', e)}
              >
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#3c3c3c] group-hover:bg-[#0078d4]/60 transition-colors" />
              </div>
              <div className="shrink-0 overflow-hidden" style={{ height: terminalHeight }}>
                <TerminalPanel onClose={() => setShowTerminal(false)} cwd={folderPath ?? undefined} />
              </div>
            </>
          )}
        </div>

        {/* Right resize handle */}
        <div
          className="group relative z-10 w-[4px] shrink-0 cursor-col-resize bg-transparent hover:bg-[#0078d4]/40 active:bg-[#0078d4]/60 transition-colors"
          onMouseDown={(e) => startDrag('right', e)}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#3c3c3c] group-hover:bg-[#0078d4]/60 transition-colors" />
        </div>

        {/* AI chat sidebar */}
        <AiChatSidebar
          messages={messages}
          warnings={warnings}
          streaming={streaming}
          input={input}
          llmModels={llmModels.filter((m) => !disabledModelPaths.includes(m.path))}
          selectedModelPath={selectedModelPath}
          onModelChange={handleModelPathChange}
          onInputChange={setInput}
          onSubmit={send}
          onStop={stopStream}
          onRegenerate={regenerateAt}
          onUserEditSubmit={submitUserEdit}
          pendingAttachments={pendingAttachments}
          onRemovePendingAttachment={handleRemovePendingAttachment}
          width={rightWidth}
        />
      </div>

      {/* Status bar */}
      <StatusBar
        branch="main"
        language={language}
        errors={0}
        warnings={warnings.length}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        baseUrl={baseUrl}
        apiKey={apiKey}
        modelPath={selectedModelPath}
        onBaseUrlChange={handleBaseUrlChange}
        onApiKeyChange={handleApiKeyChange}
        onModelPathChange={handleModelPathChange}
        editorOptions={editorOptions}
        onEditorOptionsChange={handleEditorOptionsChange}
        llmModels={llmModels}
        enabledModelPaths={llmModels.map((m) => m.path).filter((p) => !disabledModelPaths.includes(p))}
        onEnabledModelsChange={handleEnabledModelsChange}
        onRefreshModels={handleRefreshModels}
      />
    </div>
  )
}
