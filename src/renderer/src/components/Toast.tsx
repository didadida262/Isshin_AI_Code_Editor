import { faXmark, faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastItem = {
  id: string
  message: string
  type?: 'error' | 'info'
}

type Props = {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const DURATION = 5000

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(() => {
    timerRef.current = setTimeout(onDismiss, DURATION)
  }, [onDismiss])

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    start()
    return clear
  }, [start, clear])

  const isError = toast.type !== 'info'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
      onMouseEnter={clear}
      onMouseLeave={start}
      className={[
        'flex min-w-[220px] max-w-[320px] items-center gap-2 rounded-lg border px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
        isError
          ? 'border-[#5a3a2a] bg-[#2a1a0e] text-[#f4a261]'
          : 'border-[#3c3c3c] bg-[#252526] text-[#cccccc]',
      ].join(' ')}
    >
      <FontAwesomeIcon
        icon={isError ? faTriangleExclamation : faCircleInfo}
        className={`shrink-0 text-[12px] ${isError ? 'text-[#f4a261]' : 'text-[#858585]'}`}
      />
      <p className="flex-1 text-[12px] leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[#858585] transition-colors hover:text-[#cccccc]"
        aria-label="关闭"
      >
        <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
      </button>
    </motion.div>
  )
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed top-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard toast={t} onDismiss={() => onDismiss(t.id)} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((message: string, type: ToastItem['type'] = 'error') => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, push, dismiss }
}
