import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCog } from '@fortawesome/free-solid-svg-icons'
import type { ChatMessage, LlmModelOption } from './api/client'
import {
  fetchLlmModels,
  streamAgentFromPython,
} from './api/enterprise'
import type { AgentEvent } from './agent/types'
import { ActivityBar } from './components/ActivityBar'
import { AiChatSidebar } from './components/AiChatSidebar'
import { EditorArea, fileNodeToTab } from './components/EditorArea'
import type { EditorTab } from './components/EditorArea'
import { FileExplorer } from './components/FileExplorer'
import type { FileNode } from './components/FileExplorer'
import { StatusBar } from './components/StatusBar'
import { ToastContainer, useToast } from './components/Toast'
import { SettingsPanel, DEFAULT_EDITOR_OPTIONS } from './components/SettingsPanel'
import type { EditorOptions } from './components/SettingsPanel'

const MODEL_PATH_STORAGE_KEY = 'private-rag-gguf-path'
const API_KEY_STORAGE_KEY = 'private-rag-header-api-key'
const BASE_URL_STORAGE_KEY = 'private-rag-llm-base-url'
const LEGACY_AUTH_TOKEN_STORAGE_KEY = 'private-rag-header-token'
const EDITOR_OPTIONS_STORAGE_KEY = 'private-rag-editor-options'
const DISABLED_MODELS_STORAGE_KEY = 'private-rag-disabled-models'

type ActiveSection = 'explorer' | 'search' | 'git' | 'extensions' | 'chat'

export default function App() {
  // ── Editor state ──────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<ActiveSection>('explorer')
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorOptions, setEditorOptions] = useState<EditorOptions>(DEFAULT_EDITOR_OPTIONS)

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

  // ── Model loading ─────────────────────────────────────────────
  const applyModelListResult = useCallback(
    (mRes: PromiseSettledResult<LlmModelOption[]>) => {
      if (mRes.status === 'fulfilled') {
        const models = mRes.value
        setLlmModels(models)
        setSelectedModelPath((prev) => {
          if (models.length === 0) {
            try { localStorage.removeItem(MODEL_PATH_STORAGE_KEY) } catch { /* ignore */ }
            return ''
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
        setSelectedModelPath('')
        try { localStorage.removeItem(MODEL_PATH_STORAGE_KEY) } catch { /* ignore */ }
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
      setSelectedModelPath('')
      try { localStorage.removeItem(MODEL_PATH_STORAGE_KEY) } catch { /* ignore */ }
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

  const handleEnabledModelsChange = useCallback((enabledPaths: string[]) => {
    const disabled = llmModels.map((m) => m.path).filter((p) => !enabledPaths.includes(p))
    setDisabledModelPaths(disabled)
    try { localStorage.setItem(DISABLED_MODELS_STORAGE_KEY, JSON.stringify(disabled)) } catch { /* ignore */ }
  }, [llmModels])

  const handleRefreshModels = useCallback(() => {
    if (apiKey.trim()) void loadLlmModels(apiKey)
  }, [apiKey, loadLlmModels])

  // ── Editor handlers ───────────────────────────────────────────
  const handleFileClick = useCallback((node: FileNode) => {
    setActiveFileId(node.id)
    setTabs((prev) => {
      if (prev.some((t) => t.id === node.id)) return prev
      return [...prev, fileNodeToTab(node)]
    })
    setActiveTabId(node.id)
  }, [])

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

  // ── write_file 事件处理：Python agent 写入文件时同步到编辑器 ────────
  const handleWriteFile = useCallback((path: string, content: string) => {
    setTabs((prev) => {
      const exists = prev.find((t) => t.id === path || t.name === path)
      if (exists) {
        return prev.map((t) =>
          t.id === path || t.name === path
            ? { ...t, content, isDirty: true }
            : t,
        )
      }
      const ext = path.split('.').pop() ?? ''
      return [
        ...prev,
        { id: path, name: path.split('/').pop() ?? path, ext, content, isDirty: true },
      ]
    })
    setActiveTabId(path)
  }, [])

  // ── Agent runner（调用 Python FastAPI 后端）────────────────────────
  const runAgentStream = useCallback(
    async (text: string, history: ChatMessage[]) => {
      setStreaming(true)
      setWarnings([])
      const ac = new AbortController()
      streamAbortRef.current = ac

      const agentSteps: import('./api/client').AgentStep[] = []

      // 将当前所有 editor tab 内容打包发给 Python 后端
      const filesSnapshot: Record<string, string> = {}
      tabs.forEach((t) => { filesSnapshot[t.id] = t.content })
      const activeFilePath = tabs.find((t) => t.id === activeTabId)?.id ?? null

      const llmHistory = history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      try {
        if (!baseUrl.trim()) throw new Error('请填写 baseUrl')
        if (!selectedModelPath.trim()) throw new Error('请选择模型')
        if (!apiKey.trim()) throw new Error('请填写 api_key')

        await streamAgentFromPython(
          {
            userMessage: text,
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
    [baseUrl, apiKey, selectedModelPath, tabs, activeTabId, handleWriteFile],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history = [...messages]
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    await runAgentStream(text, history)
  }, [input, streaming, messages, runAgentStream])  // eslint-disable-line react-hooks/exhaustive-deps

  const regenerateAt = useCallback(
    async (assistantIndex: number) => {
      if (streaming) return
      const m = messages
      if (m[assistantIndex]?.role !== 'assistant') return
      const userPair = m[assistantIndex - 1]
      if (!userPair || userPair.role !== 'user') return
      const history = m.slice(0, assistantIndex - 1)
      const text = userPair.content
      setMessages([...m.slice(0, assistantIndex), { role: 'assistant', content: '' }])
      await runAgentStream(text, history)
    },
    [streaming, messages, runAgentStream],
  )

  const submitUserEdit = useCallback(
    async (userIndex: number, newText: string) => {
      const text = newText.trim()
      if (!text || streaming) return
      const history = messages.slice(0, userIndex)
      setMessages([
        ...messages.slice(0, userIndex),
        { role: 'user', content: text },
        { role: 'assistant', content: '' },
      ])
      await runAgentStream(text, history)
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

  const showSidePanel = activeSection === 'explorer' || activeSection === 'search' || activeSection === 'git' || activeSection === 'extensions'

  // ── Resizable panels ──────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(340)
  const dragState = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null)

  const startDrag = useCallback((side: 'left' | 'right', e: ReactMouseEvent) => {
    e.preventDefault()
    dragState.current = {
      side,
      startX: e.clientX,
      startWidth: side === 'left' ? leftWidth : rightWidth,
    }
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!dragState.current) return
      const delta = ev.clientX - dragState.current.startX
      if (dragState.current.side === 'left') {
        setLeftWidth(Math.max(140, Math.min(480, dragState.current.startWidth + delta)))
      } else {
        setRightWidth(Math.max(220, Math.min(600, dragState.current.startWidth - delta)))
      }
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [leftWidth, rightWidth])

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
          className="absolute right-2 flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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
        />

        {/* Side panel */}
        {showSidePanel && (
          <>
            <div className="shrink-0 overflow-hidden" style={{ width: leftWidth }}>
              <FileExplorer
                activeFileId={activeFileId}
                onFileClick={handleFileClick}
              />
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

        {/* Editor area */}
        <EditorArea
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={(id) => {
            setActiveTabId(id)
            setActiveFileId(id)
          }}
          onTabClose={handleTabClose}
          onContentChange={handleContentChange}
          editorOptions={editorOptions}
        />

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
          onModelChange={setSelectedModelPath}
          onInputChange={setInput}
          onSubmit={send}
          onStop={stopStream}
          onRegenerate={regenerateAt}
          onUserEditSubmit={submitUserEdit}
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
        onBaseUrlChange={handleBaseUrlChange}
        onApiKeyChange={handleApiKeyChange}
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
