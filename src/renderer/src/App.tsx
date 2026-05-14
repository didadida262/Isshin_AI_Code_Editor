import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, LlmModelOption } from './api/client'
import {
  fetchLlmModels,
  streamLlmChatCompletions,
  streamLlmChatCompletionsWithDocument,
} from './api/enterprise'
import { AppBackground } from './components/AppBackground'
import { ChatTranscript } from './components/ChatTranscript'
import { HeaderBar } from './components/HeaderBar'
import { InputBar } from './components/InputBar'
const MODEL_PATH_STORAGE_KEY = 'private-rag-gguf-path'
const API_KEY_STORAGE_KEY = 'private-rag-header-api-key'
const BASE_URL_STORAGE_KEY = 'private-rag-llm-base-url'
const CHAT_STREAM_STORAGE_KEY = 'private-rag-llm-chat-stream'
/** 历史版本曾持久化 token，启动时清掉，避免用户以为「被记住」 */
const LEGACY_AUTH_TOKEN_STORAGE_KEY = 'private-rag-header-token'

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [llmModels, setLlmModels] = useState<LlmModelOption[]>([])
  const [selectedModelPath, setSelectedModelPath] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelsListLoading, setModelsListLoading] = useState(false)
  /** 请求体 `stream` 字段，默认开启流式 */
  const [chatStreamEnabled, setChatStreamEnabled] = useState(true)
  const streamAbortRef = useRef<AbortController | null>(null)
  const [attachedDocument, setAttachedDocument] = useState<File | null>(null)

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY)
      setBaseUrl(localStorage.getItem(BASE_URL_STORAGE_KEY) ?? '')
      setApiKey(localStorage.getItem(API_KEY_STORAGE_KEY) ?? '')
      const streamStored = localStorage.getItem(CHAT_STREAM_STORAGE_KEY)
      setChatStreamEnabled(streamStored !== '0')
    } catch {
      /* ignore */
    }
  }, [])

  const applyModelListResult = useCallback(
    (mRes: PromiseSettledResult<LlmModelOption[]>) => {
      if (mRes.status === 'fulfilled') {
        const models = mRes.value
        setLlmModels(models)
        setSelectedModelPath((prev) => {
          if (models.length === 0) {
            try {
              localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
            } catch {
              /* ignore */
            }
            return ''
          }
          let next = ''
          if (prev && models.some((m) => m.path === prev)) {
            next = prev
          } else {
            try {
              const stored = localStorage.getItem(MODEL_PATH_STORAGE_KEY)
              if (stored && models.some((m) => m.path === stored)) {
                next = stored
              }
            } catch {
              /* ignore */
            }
            if (!next) next = models[0].path
          }
          try {
            if (next) localStorage.setItem(MODEL_PATH_STORAGE_KEY, next)
            else localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
          } catch {
            /* ignore */
          }
          return next
        })
      } else {
        setLlmModels([])
        setSelectedModelPath('')
        try {
          localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
        } catch {
          /* ignore */
        }
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

  /** api_key 非空时自动拉取固定 model-services 列表（防抖） */
  useEffect(() => {
    const key = apiKey.trim()
    if (!key) {
      setLlmModels([])
      setSelectedModelPath('')
      setModelsListLoading(false)
      try {
        localStorage.removeItem(MODEL_PATH_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      return
    }
    const id = window.setTimeout(() => {
      setModelsListLoading(true)
      void loadLlmModels(apiKey).finally(() => {
        setModelsListLoading(false)
      })
    }, 400)
    return () => {
      window.clearTimeout(id)
    }
  }, [apiKey, loadLlmModels])

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
        if (!baseUrl.trim()) {
          throw new Error(
            '请填写 baseUrl（API 前缀，如 https://aiplatform.njsrd.com/llm/v1）',
          )
        }
        if (!selectedModelPath.trim()) {
          throw new Error(
            '请填写 api_key 并等待模型列表加载后，在「模型」中选择一项',
          )
        }
        if (!apiKey.trim()) {
          throw new Error('请填写 api_key（将使用 Authorization: Bearer 发送）')
        }
        await streamLlmChatCompletions(
          baseUrl,
          apiKey,
          {
            model: selectedModelPath,
            messages: [...history, { role: 'user', content: text }],
            stream: chatStreamEnabled,
            signal: ac.signal,
            onToken: (t) => {
              assistant += t
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: assistant }
                }
                return next
              })
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
              }
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
              next[next.length - 1] = {
                role: 'assistant',
                content: `（错误）${msg}`,
              }
            }
            return next
          })
        }
      } finally {
        streamAbortRef.current = null
        setStreaming(false)
      }
    },
    [
      selectedModelPath,
      baseUrl,
      apiKey,
      chatStreamEnabled,
    ],
  )

  const runDocumentStream = useCallback(
    async (question: string, file: File, history: ChatMessage[]) => {
      setStreaming(true)
      setWarnings([])
      let assistant = ''
      const ac = new AbortController()
      streamAbortRef.current = ac

      try {
        if (!baseUrl.trim()) {
          throw new Error(
            '请填写 baseUrl（如 https://aiplatform.njsrd.com/llm/v1；附件经本机转发到 …/chat/completions）',
          )
        }
        if (!selectedModelPath.trim()) {
          throw new Error(
            '请填写 api_key 并等待模型列表加载后，在「模型」中选择一项',
          )
        }
        if (!apiKey.trim()) {
          throw new Error('请填写 api_key（将使用 Authorization: Bearer 发送）')
        }
        const messages = [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: question },
        ]
        await streamLlmChatCompletionsWithDocument(
          baseUrl,
          apiKey,
          {
            model: selectedModelPath,
            messages,
            file,
            stream: chatStreamEnabled,
            signal: ac.signal,
            onToken: (t) => {
              assistant += t
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: assistant }
                }
                return next
              })
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
              }
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
              next[next.length - 1] = {
                role: 'assistant',
                content: `（错误）${msg}`,
              }
            }
            return next
          })
        }
      } finally {
        streamAbortRef.current = null
        setStreaming(false)
      }
    },
    [
      selectedModelPath,
      baseUrl,
      apiKey,
      chatStreamEnabled,
    ],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history = [...messages]
    const doc = attachedDocument
    if (doc) {
      setAttachedDocument(null)
      const userLabel = `【附件：${doc.name}】\n\n${text}`
      setMessages((m) => [
        ...m,
        { role: 'user', content: userLabel },
        { role: 'assistant', content: '' },
      ])
      await runDocumentStream(text, doc, history)
      return
    }
    setMessages((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])
    await runStream(text, history)
  }, [
    input,
    streaming,
    messages,
    runStream,
    attachedDocument,
    runDocumentStream,
  ])

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

  const handleFilesChosen = useCallback(
    async (files: File[]) => {
      const f = files[0]
      if (!f) return
      if (files.length > 1) {
        setWarnings((w) => [
          ...w,
          `一次仅支持 1 个附件，已忽略除「${f.name}」外的 ${files.length - 1} 个文件。`,
        ])
      }

      const textExts = new Set([
        'txt',
        'md',
        'csv',
        'json',
        'log',
        'xml',
        'html',
        'htm',
        'tsv',
      ])
      const maxBytes = 4 * 1024 * 1024
      const serverMaxHint = 15 * 1024 * 1024

      const ext = f.name.includes('.')
        ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
        : ''
      const isPdf = ext === 'pdf' || f.type === 'application/pdf'
      const isDocx =
        ext === 'docx' ||
        f.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

      if (isPdf || isDocx) {
        if (f.size > serverMaxHint) {
          setWarnings((w) => [
            ...w,
            `「${f.name}」超过本机服务默认上限（约 15MB），请压缩或拆分后再传。`,
          ])
          return
        }
        setAttachedDocument(f)
        return
      }

      if (f.size > maxBytes) {
        setWarnings((w) => [...w, `「${f.name}」超过 4MB，未读入。`])
        return
      }
      const looksText =
        f.type.startsWith('text/') || textExts.has(ext) || ext === ''
      if (looksText) {
        try {
          const t = await f.text()
          const block = `--- ${f.name} ---\n${t}`
          setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${block}` : block))
        } catch {
          setWarnings((w) => [...w, `无法读取「${f.name}」。`])
        }
        return
      }
      setWarnings((w) => [
        ...w,
        `「${f.name}」：请使用纯文本，或 PDF / Word（.docx）作为附件。`,
      ])
    },
    [],
  )

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 flex-row overflow-hidden bg-transparent text-zinc-900 dark:text-zinc-100">
      <AppBackground />
      <HeaderBar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ChatTranscript
          messages={messages}
          warnings={warnings}
          streaming={streaming}
          onRegenerate={regenerateAt}
          onUserEditSubmit={submitUserEdit}
        />
        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={send}
          streaming={streaming}
          onStop={stopStream}
          onFilesChosen={handleFilesChosen}
          attachedDocumentName={attachedDocument?.name ?? null}
          onClearAttachedDocument={() => setAttachedDocument(null)}
        />
      </div>
    </div>
  )
}
