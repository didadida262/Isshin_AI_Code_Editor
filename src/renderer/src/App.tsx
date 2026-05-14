import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCog } from '@fortawesome/free-solid-svg-icons'
import type { ChatMessage, LlmModelOption } from './api/client'
import {
  fetchLlmModels,
  streamLlmChatCompletions,
} from './api/enterprise'
import { ActivityBar } from './components/ActivityBar'
import { AiChatSidebar } from './components/AiChatSidebar'
import { EditorArea, fileNodeToTab } from './components/EditorArea'
import type { EditorTab } from './components/EditorArea'
import { FileExplorer } from './components/FileExplorer'
import type { FileNode } from './components/FileExplorer'
import { StatusBar } from './components/StatusBar'
import { ToastContainer, useToast } from './components/Toast'

const MODEL_PATH_STORAGE_KEY = 'private-rag-gguf-path'
const API_KEY_STORAGE_KEY = 'private-rag-header-api-key'
const BASE_URL_STORAGE_KEY = 'private-rag-llm-base-url'
const CHAT_STREAM_STORAGE_KEY = 'private-rag-llm-chat-stream'
const LEGACY_AUTH_TOKEN_STORAGE_KEY = 'private-rag-header-token'

type ActiveSection = 'explorer' | 'search' | 'git' | 'extensions' | 'chat'

export default function App() {
  // ── Editor state ──────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<ActiveSection>('explorer')
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)

  // ── Toast ─────────────────────────────────────────────────────
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast()

  // ── Chat state ────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [llmModels, setLlmModels] = useState<LlmModelOption[]>([])
  const [selectedModelPath, setSelectedModelPath] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [chatStreamEnabled, setChatStreamEnabled] = useState(true)
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
      const streamStored = localStorage.getItem(CHAT_STREAM_STORAGE_KEY)
      setChatStreamEnabled(streamStored !== '0')
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

  // ── Chat stream ───────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamAbortRef.current?.abort()
  }, [])

  const runStream = useCallback(
    async (text: string, history: ChatMessage[]) => {
      setStreaming(true)
      setWarnings([])
      let assistant = ''
      const ac = new AbortController()
      streamAbortRef.current = ac

      try {
        if (!baseUrl.trim()) throw new Error('请填写 baseUrl')
        if (!selectedModelPath.trim()) throw new Error('请填写 api_key 并选择模型')
        if (!apiKey.trim()) throw new Error('请填写 api_key')

        await streamLlmChatCompletions(baseUrl, apiKey, {
          model: selectedModelPath,
          messages: [...history, { role: 'user', content: text }],
          stream: chatStreamEnabled,
          signal: ac.signal,
          onToken: (t) => {
            assistant += t
            setMessages((m) => {
              const next = [...m]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistant }
              return next
            })
          },
        })
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        if (aborted) {
          setMessages((m) => {
            const next = [...m]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              const cur = last.content.trim()
              next[next.length - 1] = { ...last, content: cur ? `${cur}\n\n（已停止生成）` : '（已停止生成）' }
            }
            return next
          })
        } else {
          const msg = e instanceof Error ? e.message : '请求失败'
          setWarnings((w) => [...w, msg])
          setMessages((m) => {
            const next = [...m]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && !last.content) {
              next[next.length - 1] = { role: 'assistant', content: `（错误）${msg}` }
            }
            return next
          })
        }
      } finally {
        streamAbortRef.current = null
        setStreaming(false)
      }
    },
    [selectedModelPath, baseUrl, apiKey, chatStreamEnabled],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history = [...messages]
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    await runStream(text, history)
  }, [input, streaming, messages, runStream])

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
      await runStream(text, history)
    },
    [streaming, messages, runStream],
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
      await runStream(text, history)
    },
    [streaming, messages, runStream],
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
          {activeTab ? `${activeTab.name} — ISShin Code` : 'ISShin Code'}
        </span>
        <div
          className="absolute right-2 flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            title="设置"
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
          llmModels={llmModels}
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
    </div>
  )
}
