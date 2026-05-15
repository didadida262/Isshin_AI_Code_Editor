import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import {
  faPlus,
  faTimes,
  faChevronDown,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── xterm 主题（与编辑器配色一致）────────────────────────────────────

const XTERM_THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#cccccc',
  cursorAccent: '#1e1e1e',
  black: '#1e1e1e',
  red: '#f48771',
  green: '#4ec9b0',
  yellow: '#dcdcaa',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#4fc1ff',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#4ade80',
  brightYellow: '#ffff00',
  brightBlue: '#6a9fd8',
  brightMagenta: '#d670d6',
  brightCyan: '#36acaa',
  brightWhite: '#ffffff',
  selectionBackground: '#264f78',
}

// ── 单个终端实例组件 ──────────────────────────────────────────────────

function TermInstance({
  id,
  active,
  cwd,
}: {
  id: string
  active: boolean
  cwd?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const unlistenOutput = useRef<UnlistenFn | null>(null)
  const unlistenExit = useRef<UnlistenFn | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      // 优先使用 Nerd Font / 等宽字体，fallback 到系统字体
      fontFamily: '"MesloLGS NF", "JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.3,
      theme: XTERM_THEME,
      convertEol: true,
      allowProposedApi: true,
      // 告诉 xterm 使用 Unicode 11 宽字符规则
      unicodeVersion: '11',
    })

    const fit = new FitAddon()
    const unicode11 = new Unicode11Addon()
    term.loadAddon(unicode11)
    term.loadAddon(fit)
    // 激活 Unicode 11（正确处理 emoji / Powerline / CJK 宽字符）
    term.unicode.activeVersion = '11'
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // 通知 Rust 创建 PTY，传入当前项目目录
    const { rows, cols } = term
    void invoke('create_terminal', { id, cols, rows, cwd: cwd ?? null }).catch((e) => {
      term.writeln(`\x1b[31m[错误] 无法创建终端: ${e}\x1b[0m`)
    })

    // 监听 PTY 输出事件
    listen<string>(`terminal-output-${id}`, (ev) => {
      term.write(ev.payload)
    }).then((fn) => { unlistenOutput.current = fn })

    // 监听 PTY 退出事件
    listen(`terminal-exit-${id}`, () => {
      term.writeln('\r\n\x1b[2m[进程已退出]\x1b[0m')
    }).then((fn) => { unlistenExit.current = fn })

    // 键盘输入 → 写入 PTY
    term.onData((data) => {
      void invoke('write_terminal', { id, data })
    })

    // 自适应 resize
    const observer = new ResizeObserver(() => {
      fit.fit()
      const { rows, cols } = term
      void invoke('resize_terminal', { id, cols, rows })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      unlistenOutput.current?.()
      unlistenExit.current?.()
      void invoke('destroy_terminal', { id })
      term.dispose()
    }
  }, [id, cwd])

  // 切换 active 时重新 fit
  useEffect(() => {
    if (active && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 30)
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}

// ── TerminalPanel 主组件 ──────────────────────────────────────────────

type Tab = { id: string; title: string }

type Props = {
  onClose: () => void
  cwd?: string
}

let tabCounter = 1

export function TerminalPanel({ onClose, cwd }: Props) {
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: `term-${Date.now()}`, title: `终端 ${tabCounter++}` },
  ])
  const [activeId, setActiveId] = useState<string>(tabs[0].id)

  const addTab = useCallback(() => {
    const id = `term-${Date.now()}`
    const title = `终端 ${tabCounter++}`
    setTabs((prev) => [...prev, { id, title }])
    setActiveId(id)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (next.length === 0) {
        onClose()
        return prev
      }
      if (activeId === tabId) {
        setActiveId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeId, onClose])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1e1e1e]">
      {/* Tab bar */}
      <div className="flex h-[34px] shrink-0 items-stretch border-t border-[#3c3c3c] bg-[#252526]">
        {/* Tabs */}
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId
            return (
              <div
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={[
                  'group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-[#3c3c3c] px-3 text-[12px] transition-colors',
                  isActive
                    ? 'border-t border-t-[#cccccc] bg-[#1e1e1e] text-[#cccccc]'
                    : 'text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]',
                ].join(' ')}
              >
                <span>{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[#3c3c3c] group-hover:opacity-60 hover:!opacity-100"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-[9px]" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-0.5 px-1.5">
          <button
            type="button"
            title="新建终端"
            onClick={addTab}
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-[11px]" />
          </button>
          <button
            type="button"
            title="删除当前终端"
            onClick={() => closeTab(activeId)}
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
          </button>
          <button
            type="button"
            title="关闭终端面板"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faChevronDown} className="text-[11px]" />
          </button>
        </div>
      </div>

      {/* Xterm instances（保持挂载，CSS 切换 display）*/}
      <div className="min-h-0 flex-1 overflow-hidden px-1 pt-1 pb-0">
        {tabs.map((tab) => (
          <TermInstance key={tab.id} id={tab.id} active={tab.id === activeId} cwd={cwd} />
        ))}
      </div>
    </div>
  )
}
