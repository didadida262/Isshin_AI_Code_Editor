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
  warnings: string[]
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
  warnings,
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
      {warnings.length > 0 ? (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200/90">
          {warnings.map((w, i) => (
            <p key={`${i}-${w.slice(0, 40)}`}>{w}</p>
          ))}
        </div>
      ) : null}
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
            <ul className={`flex w-full flex-col gap-3 ${compact ? '' : 'mx-auto max-w-3xl gap-4'}`}>
              {messages.map((m, i) => {
                const isStreamingThisAssistant =
                  m.role === 'assistant' &&
                  streaming &&
                  i === messages.length - 1
                return (
                <motion.li
                  key={`msg-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={
                    m.role === 'assistant'
                      ? 'group flex w-full min-w-0 flex-col gap-1'
                      : 'group flex w-full min-w-0 items-start justify-end'
                  }
                >
                  {m.role === 'assistant' ? (
                    <div
                      className="w-full min-w-0 rounded-2xl border border-zinc-200/90 bg-zinc-50/95 p-4 shadow-sm sm:p-5 dark:border-zinc-700/55 dark:bg-zinc-900/75 dark:shadow-[0_8px_32px_-14px_rgba(0,0,0,0.75)]"
                    >
                      <div className="flex w-full min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-400/45 bg-teal-600 text-white shadow-sm dark:border-emerald-400/40 dark:bg-emerald-900/90 dark:shadow-[0_0_18px_rgba(52,211,153,0.22)]">
                          <ChatGPTAvatar className="h-5 w-5" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2 text-left text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
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
                            <div className="flex flex-wrap items-center gap-0.5 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await copyToClipboard(m.content)
                                  if (ok) flashCopied(`c-${i}`)
                                }}
                                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200"
                                aria-label="复制"
                                title="复制"
                              >
                                <CopyIcon className="h-4 w-4" />
                              </button>
                              {copiedKey === `c-${i}` ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                  已复制
                                </span>
                              ) : null}
                              <button
                                type="button"
                                disabled={
                                  streaming ||
                                  i < 1 ||
                                  messages[i - 1]?.role !== 'user'
                                }
                                onClick={() => onRegenerate(i)}
                                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200"
                                aria-label="重新生成"
                                title="重新生成"
                              >
                                <RegenerateIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5 items-end">
                      <div
                        className={`w-full text-sm leading-snug rounded-xl bg-cyan-500/10 px-3.5 py-2 text-zinc-900 shadow-sm dark:bg-zinc-900/80 dark:text-zinc-100 dark:shadow-[0_0_28px_-12px_rgba(34,211,238,0.2)]`}
                      >
                        {editingUserIndex === i ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={3}
                              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-cyan-500/50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={streaming || !editDraft.trim()}
                                className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
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
                        <div className="flex w-full items-center justify-end gap-0.5 px-0.5 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyToClipboard(m.content)
                              if (ok) flashCopied(`c-${i}`)
                            }}
                            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            aria-label="复制"
                            title="复制"
                          >
                            <CopyIcon className="h-4 w-4" />
                          </button>
                          {copiedKey === `c-${i}` ? (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              已复制
                            </span>
                          ) : null}
                          <button
                            type="button"
                            disabled={streaming}
                            onClick={() => startEditUser(i, m.content)}
                            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            aria-label="编辑"
                            title="编辑"
                          >
                            <EditIcon className="h-4 w-4" />
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
