import Editor, { type OnMount } from '@monaco-editor/react'
import {
  faFile,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useRef, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { EditorOptions } from './SettingsPanel'
import { DEFAULT_EDITOR_OPTIONS } from './SettingsPanel'

export type EditorTab = {
  id: string
  name: string
  ext?: string
  content: string
  isDirty?: boolean
}

export type EditorSelectionPayload = {
  filePath: string
  fileName: string
  language?: string
  startLine: number
  endLine: number
  code: string
}

type Props = {
  tabs: EditorTab[]
  activeTabId: string | null
  onTabClick: (id: string) => void
  onTabClose: (id: string) => void
  onContentChange: (id: string, value: string) => void
  onAddSelectionToChat?: (payload: EditorSelectionPayload) => void
  editorOptions?: EditorOptions
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  py: 'python',
  rs: 'rust',
  toml: 'ini',
}

const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6',
  tsx: '#38bdf8',
  js: '#facc15',
  jsx: '#facc15',
  json: '#a3e635',
  md: '#a78bfa',
  css: '#f472b6',
  html: '#fb923c',
  py: '#34d399',
  rs: '#f97316',
  toml: '#94a3b8',
}

function getLanguage(ext?: string) {
  if (!ext) return 'plaintext'
  return EXT_LANGUAGE[ext.toLowerCase()] ?? 'plaintext'
}

function getExtColor(ext?: string) {
  if (!ext) return '#858585'
  return EXT_COLOR[ext.toLowerCase()] ?? '#858585'
}

const WELCOME_CONTENT = `// 欢迎使用 Isshin AI Code Editor
//
// 在左侧文件管理器中点击文件即可在此处打开
// 支持语法高亮、智能提示等功能
//
// Tip: 在右侧 AI 面板中可以向 Isshin AI Code Editor 提问

`


type SelectionAnchor = {
  /** 编辑器内坐标（相对于 monaco DOM 节点） */
  top: number
  left: number
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
}

export function EditorArea({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onContentChange,
  onAddSelectionToChat,
  editorOptions = DEFAULT_EDITOR_OPTIONS,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
  // 「记忆 prop」模式：tab 切换时同步丢弃过期 anchor（React 推荐写法）
  const [prevTabId, setPrevTabId] = useState<string | null>(activeTabId)
  if (prevTabId !== activeTabId) {
    setPrevTabId(activeTabId)
    if (selectionAnchor !== null) setSelectionAnchor(null)
  }

  const recomputeAnchor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      setSelectionAnchor(null)
      return
    }
    const sel = editor.getSelection()
    if (!sel || sel.isEmpty()) {
      setSelectionAnchor(null)
      return
    }
    // 把选区起点的视口坐标转为相对编辑器 DOM 节点的像素位置
    const visible = editor.getScrolledVisiblePosition({
      lineNumber: sel.startLineNumber,
      column: sel.startColumn,
    })
    if (!visible) {
      setSelectionAnchor(null)
      return
    }
    setSelectionAnchor({
      top: visible.top,
      left: visible.left,
      startLine: sel.startLineNumber,
      endLine: sel.endLineNumber,
      startColumn: sel.startColumn,
      endColumn: sel.endColumn,
    })
  }, [])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    const disposables = [
      editor.onDidChangeCursorSelection(() => recomputeAnchor()),
      editor.onDidScrollChange(() => recomputeAnchor()),
      editor.onDidBlurEditorText(() => {
        // 失焦稍作延迟，避免点击浮层按钮时先关闭
        window.setTimeout(() => {
          const sel = editorRef.current?.getSelection()
          if (!sel || sel.isEmpty()) setSelectionAnchor(null)
        }, 150)
      }),
    ]
    editor.onDidDispose(() => {
      disposables.forEach((d) => d.dispose())
      editorRef.current = null
    })
  }, [recomputeAnchor])

  const handleAddToChatClick = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !activeTab || !onAddSelectionToChat) return
    const sel = editor.getSelection()
    if (!sel || sel.isEmpty()) return
    const model = editor.getModel()
    if (!model) return
    const code = model.getValueInRange(sel)
    if (!code) return
    onAddSelectionToChat({
      filePath: activeTab.id,
      fileName: activeTab.name,
      language: getLanguage(activeTab.ext),
      startLine: sel.startLineNumber,
      endLine: sel.endLineNumber,
      code,
    })
    setSelectionAnchor(null)
  }, [activeTab, onAddSelectionToChat])

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-[#252526] bg-[#252526] scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                className={[
                  'group flex min-w-0 max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-[#3c3c3c] px-3 text-[13px] transition-colors',
                  isActive
                    ? 'bg-[#1e1e1e] text-[#ffffff]'
                    : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e] hover:text-[#cccccc]',
                ].join(' ')}
                onClick={() => onTabClick(tab.id)}
              >
                <FontAwesomeIcon
                  icon={faFile}
                  style={{ color: getExtColor(tab.ext) }}
                  className="shrink-0 text-[11px]"
                />
                <span className="truncate">{tab.name}</span>
                {tab.isDirty && (
                  <span className="shrink-0 text-[8px] text-[#cccccc]">●</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTabClose(tab.id)
                  }}
                  className={[
                    'ml-auto shrink-0 flex h-4 w-4 items-center justify-center rounded transition-colors',
                    isActive
                      ? 'opacity-0 hover:bg-[#3c3c3c] hover:opacity-100 group-hover:opacity-100'
                      : 'opacity-0 hover:bg-[#3c3c3c] hover:opacity-100 group-hover:opacity-70',
                  ].join(' ')}
                  aria-label={`关闭 ${tab.name}`}
                >
                  <FontAwesomeIcon icon={faTimes} className="text-[9px]" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Breadcrumb */}
      {activeTab && (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-[#3c3c3c] bg-[#1e1e1e] px-3 text-[12px] text-[#858585]">
          <span>src</span>
          <span>/</span>
          <span>renderer</span>
          <span>/</span>
          <span style={{ color: getExtColor(activeTab.ext) }}>{activeTab.name}</span>
        </div>
      )}

      {/* Editor */}
      <div className="relative min-h-0 flex-1">
        {activeTab ? (
          <>
            <Editor
              height="100%"
              language={getLanguage(activeTab.ext)}
              value={activeTab.content}
              onChange={(val) => onContentChange(activeTab.id, val ?? '')}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: editorOptions.fontSize,
                fontFamily: editorOptions.fontFamily,
                fontLigatures: editorOptions.fontLigatures,
                lineHeight: Math.round(editorOptions.fontSize * 1.55),
                minimap: { enabled: editorOptions.minimap },
                scrollBeyondLastLine: false,
                renderWhitespace: editorOptions.renderWhitespace,
                smoothScrolling: true,
                cursorBlinking: editorOptions.cursorBlinking,
                cursorSmoothCaretAnimation: 'on',
                tabSize: editorOptions.tabSize,
                wordWrap: editorOptions.wordWrap,
                lineNumbers: editorOptions.lineNumbers,
                padding: { top: 12, bottom: 12 },
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: 'gutter',
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
              }}
            />
            {selectionAnchor && onAddSelectionToChat && (
              <SelectionActionBubble
                anchor={selectionAnchor}
                onAddToChat={handleAddToChatClick}
              />
            )}
          </>
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}

function SelectionActionBubble({
  anchor,
  onAddToChat,
}: {
  anchor: SelectionAnchor
  onAddToChat: () => void
}) {
  // 把浮层放在选区起点上方；起点离顶不够时降到选区下方
  const BUBBLE_HEIGHT = 30
  const OFFSET = 6
  const aboveTop = anchor.top - BUBBLE_HEIGHT - OFFSET
  const placeAbove = aboveTop > 4
  const top = placeAbove ? aboveTop : anchor.top + 18 + OFFSET
  const left = Math.max(8, anchor.left)

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-[#3c3c3c] bg-[#252526] px-1 py-0.5 text-[12px] text-[#cccccc] shadow-lg shadow-black/40"
      style={{ top, left }}
      // mousedown 阻止冒泡，避免触发编辑器失焦/选区清除
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onAddToChat}
        className="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#3c3c3c]"
        title={`将第 ${anchor.startLine}-${anchor.endLine} 行加入对话`}
      >
        <span className="text-[10px] opacity-70">＋</span>
        <span>加入对话</span>
        <span className="ml-1 rounded bg-[#1e1e1e] px-1 text-[10px] text-[#858585]">
          {anchor.startLine === anchor.endLine
            ? `L${anchor.startLine}`
            : `L${anchor.startLine}-${anchor.endLine}`}
        </span>
      </button>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-[64px] opacity-10 select-none">{'</>'}</div>
      <p className="text-[13px] text-[#858585]">从左侧资源管理器打开文件</p>
      <p className="text-[11px] text-[#6b6b6b]">或使用右侧 Isshin AI Code Editor 进行对话</p>
    </div>
  )
}
