import {
  faArrowUp,
  faSquare,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  streaming: boolean
  onStop: () => void
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  streaming,
  onStop,
}: Props) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const wasStreaming = useRef(false)

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
          <div className="flex items-center justify-end px-2 pb-2 pt-1">
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
