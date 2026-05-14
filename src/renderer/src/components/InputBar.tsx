import {
  faArrowUp,
  faSquare,
  faChevronDown,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LlmModelOption } from '../api/client'

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  streaming: boolean
  onStop: () => void
  models?: LlmModelOption[]
  selectedModelPath?: string
  onModelChange?: (path: string) => void
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  streaming,
  onStop,
  models,
  selectedModelPath,
  onModelChange,
}: Props) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const wasStreaming = useRef(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modelFilter, setModelFilter] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const submit = useCallback(() => {
    if (streaming || !value.trim()) return
    onSubmit()
  }, [streaming, onSubmit, value])

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 36), 200)}px`
  }, [value])

  useEffect(() => {
    if (wasStreaming.current && !streaming) {
      ta.current?.focus({ preventScroll: true })
    }
    wasStreaming.current = streaming
  }, [streaming])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setModelFilter('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const currentModel = models?.find((m) => m.path === selectedModelPath)
  const filteredModels = models?.filter(
    (m) =>
      m.label.toLowerCase().includes(modelFilter.toLowerCase()) ||
      m.path.toLowerCase().includes(modelFilter.toLowerCase()),
  ) ?? []

  return (
    <div className="shrink-0 px-3 pb-3 pt-2">
      {/* Main input box */}
      <div className="flex flex-col rounded-xl border border-[#3c3c3c] bg-[#2a2a2a] transition-[border-color] duration-150 focus-within:border-[#555555]">
        {/* Textarea */}
        <textarea
          ref={ta}
          rows={1}
          value={value}
          disabled={streaming}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="有问题，尽管问"
          className="block max-h-[200px] min-h-[36px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-5 text-[#cccccc] outline-none placeholder:text-[#555555] disabled:opacity-60"
        />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            {/* Model selector */}
            {models && models.length > 0 ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex max-w-[160px] items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#6b6b6b] transition-colors hover:bg-[#3c3c3c] hover:text-[#aaaaaa]"
                >
                  <span className="truncate">{currentModel?.label ?? selectedModelPath ?? '选择模型'}</span>
                  <FontAwesomeIcon icon={faChevronDown} className="shrink-0 text-[8px] opacity-70" />
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div className="absolute bottom-full left-0 z-50 mb-1.5 w-56 overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl">
                    {/* Search */}
                    <div className="border-b border-[#3c3c3c] px-2 py-2">
                      <input
                        autoFocus
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        placeholder="搜索模型"
                        className="w-full rounded border border-[#3c3c3c] bg-[#2d2d2d] px-2 py-1 text-[12px] text-[#cccccc] placeholder-[#5a5a5a] outline-none transition-colors focus:border-[#555555]"
                      />
                    </div>
                    {/* Model list */}
                    <div className="max-h-52 overflow-y-auto py-0.5">
                      {filteredModels.length === 0 && (
                        <p className="px-3 py-3 text-center text-[12px] text-[#5a5a5a]">无匹配模型</p>
                      )}
                      {filteredModels.map((m) => (
                        <button
                          key={m.path}
                          type="button"
                          onClick={() => {
                            onModelChange?.(m.path)
                            setDropdownOpen(false)
                            setModelFilter('')
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#cccccc] transition-colors hover:bg-[#2a2a2a]"
                        >
                          <span className="flex-1 truncate">{m.label}</span>
                          {m.path === selectedModelPath && (
                            <FontAwesomeIcon
                              icon={faCheck}
                              className="shrink-0 text-[10px] text-[#22c55e]"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center">
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#cccccc] text-[#1a1a1a] transition hover:bg-[#ffffff]"
                aria-label="停止生成"
              >
                <FontAwesomeIcon icon={faSquare} className="text-[8px] leading-none" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!value.trim()}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#cccccc] text-[#1a1a1a] transition hover:bg-[#ffffff] disabled:cursor-not-allowed disabled:bg-[#3c3c3c] disabled:text-[#6b6b6b]"
                aria-label="发送"
              >
                <FontAwesomeIcon icon={faArrowUp} className="text-[11px] leading-none" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
