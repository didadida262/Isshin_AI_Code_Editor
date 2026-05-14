import { motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import type { ChatMessage } from '../api/client'
import { ChatGPTAvatar } from './ChatGPTAvatar'
import { CopyIcon } from './CopyIcon'
import { MarkdownContent } from './MarkdownContent'
import { EditIcon } from './EditIcon'
import { RegenerateIcon } from './RegenerateIcon'

type Props = {
  messages: ChatMessage[]
  streaming: boolean
  onRegenerate: (assistantMessageIndex: number) => void
  onUserEditSubmit: (userMessageIndex: number, newText: string) => void
  compact?: boolean
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function ChatTranscript({
  messages,
  streaming,
  onRegenerate,
  onUserEditSubmit,
  compact = false,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600)
  }, [])

  const startEditUser = useCallback((index: number, content: string) => {
    setEditingUserIndex(index)
    setEditDraft(content)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingUserIndex(null)
    setEditDraft('')
  }, [])

  const saveEdit = useCallback(() => {
    if (editingUserIndex === null) return
    onUserEditSubmit(editingUserIndex, editDraft)
    setEditingUserIndex(null)
    setEditDraft('')
  }, [editingUserIndex, editDraft, onUserEditSubmit])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              {compact ? (
                <div className="flex flex-col items-center gap-3">
                  <span className="text-[32px] opacity-20 select-none">✦</span>
                  <p className="text-[13px] text-[#858585]">需要我为你做些什么？</p>
                </div>
              ) : (
                <div className="rag-hero-empty">
                  <h1 className="rag-hero-title text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] lg:leading-tight">
                    需要我为你做些什么？
                  </h1>
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain ${compact ? 'px-3 py-3' : 'px-5 py-4 sm:px-8'}`}>
            <ul className={`flex w-full flex-col ${compact ? '' : 'mx-auto max-w-3xl'}`}>
              {messages.map((m, i) => {
                const isStreamingThisAssistant =
                  m.role === 'assistant' &&
                  streaming &&
                  i === messages.length - 1
                const prev = messages[i - 1]
                // 同轮内（user→assistant）间距小，跨轮（assistant/null→user）间距大
                const marginTop = i === 0
                  ? ''
                  : m.role === 'assistant' && prev?.role === 'user'
                    ? 'mt-2'
                    : 'mt-6'
                return (
                <motion.li
                  key={`msg-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={[
                    marginTop,
                    m.role === 'assistant'
                      ? 'group flex w-full min-w-0 flex-col gap-1'
                      : 'group flex w-full min-w-0 items-start justify-end',
                  ].join(' ')}
                >
                  {m.role === 'assistant' ? (
                    <div
                      className="w-full min-w-0 rounded-xl border border-[#3c3c3c] bg-[#252526] px-3 py-2.5"
                    >
                      <div className="flex w-full min-w-0 items-start gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1a6b4a] text-white">
                          <ChatGPTAvatar className="h-4 w-4" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left text-[13px] leading-relaxed text-[#cccccc]">
                          {isStreamingThisAssistant && !m.content ? (
                            <div
                              className="flex min-h-9 items-center"
                              aria-busy="true"
                              aria-label="正在生成"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {[0, 1, 2].map((dot) => (
                                  <motion.span
                                    key={dot}
                                    className="h-2 w-2 rounded-full bg-cyan-500 dark:bg-cyan-400"
                                    animate={{
                                      y: [0, -5, 0],
                                      opacity: [0.35, 1, 0.35],
                                      scale: [0.92, 1, 0.92],
                                    }}
                                    transition={{
                                      duration: 0.55,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                      delay: dot * 0.14,
                                    }}
                                  />
                                ))}
                              </span>
                            </div>
                          ) : (
                            <MarkdownContent content={m.content} />
                          )}
                          {!isStreamingThisAssistant ? (
                            <div className="flex flex-wrap items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await copyToClipboard(m.content)
                                  if (ok) flashCopied(`c-${i}`)
                                }}
                                className="rounded p-1 text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]"
                                aria-label="复制"
                                title="复制"
                              >
                                <CopyIcon className="h-3 w-3" />
                              </button>
                              {copiedKey === `c-${i}` ? (
                                <span className="text-[10px] text-[#858585]">已复制</span>
                              ) : null}
                              <button
                                type="button"
                                disabled={
                                  streaming ||
                                  i < 1 ||
                                  messages[i - 1]?.role !== 'user'
                                }
                                onClick={() => onRegenerate(i)}
                                className="rounded p-1 text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc] disabled:opacity-40"
                                aria-label="重新生成"
                                title="重新生成"
                              >
                                <RegenerateIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-w-0 max-w-[85%] flex-col gap-1 items-end">
                      <div className="rounded-xl border border-[#3c3c3c] bg-[#2d2d2d] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#cccccc]">
                        {editingUserIndex === i ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={3}
                              className="w-full resize-y rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1.5 text-[13px] text-[#cccccc] outline-none focus:border-[#555555]"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-lg border border-[#3c3c3c] px-3 py-1 text-xs text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={streaming || !editDraft.trim()}
                                className="rounded-lg bg-[#cccccc] px-3 py-1 text-xs font-medium text-[#1a1a1a] hover:bg-white disabled:opacity-50"
                              >
                                保存并重新发送
                              </button>
                            </div>
                          </div>
                        ) : (
                          <MarkdownContent content={m.content} compact />
                        )}
                      </div>

                      {!(editingUserIndex === i) ? (
                        <div className="flex items-center gap-0.5 px-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyToClipboard(m.content)
                              if (ok) flashCopied(`c-${i}`)
                            }}
                            className="rounded-md p-1 text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]"
                            aria-label="复制"
                            title="复制"
                          >
                            <CopyIcon className="h-3.5 w-3.5" />
                          </button>
                          {copiedKey === `c-${i}` && (
                            <span className="text-[10px] text-[#858585]">已复制</span>
                          )}
                          <button
                            type="button"
                            disabled={streaming}
                            onClick={() => startEditUser(i, m.content)}
                            className="rounded-md p-1 text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc] disabled:opacity-40"
                            aria-label="编辑"
                            title="编辑"
                          >
                            <EditIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
