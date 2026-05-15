import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import {
  faFile,
  faTimes,
  faCheck,
  faXmark,
  faCodeCompare,
  faPen,
  faRobot,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { EditorOptions } from './SettingsPanel'
import { DEFAULT_EDITOR_OPTIONS } from './SettingsPanel'

export type EditorTab = {
  id: string
  name: string
  ext?: string
  content: string
  isDirty?: boolean
  /** agent 改动前的内容快照；接受后清空，拒绝后用于还原 */
  originalContent?: string
  /** 该 tab 正等待用户裁决（接受 / 拒绝）agent 的修改 */
  pendingAgentEdit?: boolean
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
  onSaveTab?: (id: string) => void
  onAcceptAgentEdit?: (id: string) => void
  onRejectAgentEdit?: (id: string) => void
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
  onSaveTab,
  onAcceptAgentEdit,
  onRejectAgentEdit,
  editorOptions = DEFAULT_EDITOR_OPTIONS,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit')

  // ⌘S 走最新的 activeTabId，用 ref 跨过 Monaco addCommand 的闭包
  const saveActiveRef = useRef<() => void>(() => {})
  useEffect(() => {
    saveActiveRef.current = () => {
      if (activeTabId && onSaveTab) onSaveTab(activeTabId)
    }
  }, [activeTabId, onSaveTab])

  // 「记忆 prop」模式：tab 切换时同步丢弃过期 anchor / diff 视图（React 推荐写法）
  const [prevTabId, setPrevTabId] = useState<string | null>(activeTabId)
  if (prevTabId !== activeTabId) {
    setPrevTabId(activeTabId)
    if (selectionAnchor !== null) setSelectionAnchor(null)
    if (viewMode !== 'edit') setViewMode('edit')
  }

  // pendingAgentEdit 从 true 变 false 时强制回到普通编辑视图（同步派生）
  const pendingAgentEdit = activeTab?.pendingAgentEdit ?? false
  const [prevPending, setPrevPending] = useState<boolean>(pendingAgentEdit)
  if (prevPending !== pendingAgentEdit) {
    setPrevPending(pendingAgentEdit)
    if (!pendingAgentEdit && viewMode === 'diff') setViewMode('edit')
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

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
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
    // ⌘S / Ctrl+S 触发保存当前 tab（含「接受 agent 修改」语义）
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveRef.current()
    })
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

      {/* Agent edit banner */}
      {activeTab?.pendingAgentEdit && (
        <AgentEditBanner
          stats={diffStats(activeTab.originalContent ?? '', activeTab.content)}
          viewMode={viewMode}
          onToggleView={() => setViewMode((v) => (v === 'edit' ? 'diff' : 'edit'))}
          onAccept={() => activeTab && onAcceptAgentEdit?.(activeTab.id)}
          onReject={() => activeTab && onRejectAgentEdit?.(activeTab.id)}
        />
      )}

      {/* Editor */}
      <div className="relative min-h-0 flex-1">
        {activeTab ? (
          viewMode === 'diff' && activeTab.pendingAgentEdit ? (
            <DiffEditor
              height="100%"
              language={getLanguage(activeTab.ext)}
              original={activeTab.originalContent ?? ''}
              modified={activeTab.content}
              theme="vs-dark"
              onMount={(diffEditor, monaco) => {
                // 监听右侧 modified 编辑器的内容变化，回写到 tab.content
                const modifiedEditor = diffEditor.getModifiedEditor()
                modifiedEditor.onDidChangeModelContent(() => {
                  onContentChange(activeTab.id, modifiedEditor.getValue())
                })
                // ⌘S 在 diff 视图同样可用 → 接受当前 modified 内容
                modifiedEditor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                  () => saveActiveRef.current(),
                )
              }}
              options={{
                fontSize: editorOptions.fontSize,
                fontFamily: editorOptions.fontFamily,
                lineHeight: Math.round(editorOptions.fontSize * 1.55),
                renderSideBySide: true,
                originalEditable: false,
                readOnly: false,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: 'gutter',
              }}
            />
          ) : (
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
          )
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}

// ── Agent 修改横幅 + 行级差异统计 ─────────────────────────────────────

type DiffStats = { added: number; removed: number }

function diffStats(original: string, modified: string): DiffStats {
  if (original === modified) return { added: 0, removed: 0 }
  const a = original ? original.split('\n') : []
  const b = modified ? modified.split('\n') : []
  // 最长公共子序列长度 → 加 = b.length - lcs，减 = a.length - lcs
  // 大文件兜底：行数过多时退化为绝对差值，避免 O(n*m) 卡 UI
  if (a.length * b.length > 200_000) {
    return {
      added: Math.max(0, b.length - a.length),
      removed: Math.max(0, a.length - b.length),
    }
  }
  const m = a.length
  const n = b.length
  const dp = new Uint32Array((m + 1) * (n + 1))
  const idx = (i: number, j: number) => i * (n + 1) + j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[idx(i, j)] =
        a[i - 1] === b[j - 1]
          ? dp[idx(i - 1, j - 1)] + 1
          : Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)])
    }
  }
  const lcs = dp[idx(m, n)]
  return { added: n - lcs, removed: m - lcs }
}

function AgentEditBanner({
  stats,
  viewMode,
  onToggleView,
  onAccept,
  onReject,
}: {
  stats: DiffStats
  viewMode: 'edit' | 'diff'
  onToggleView: () => void
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-[#3c3c3c] bg-[#1f2a1f] px-3 text-[12px] text-[#cccccc]">
      <div className="flex min-w-0 items-center gap-2">
        <FontAwesomeIcon icon={faRobot} className="shrink-0 text-[11px] text-[#4ade80]" />
        <span className="truncate">AI 修改了此文件</span>
        <span className="shrink-0 rounded bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-[10px]">
          <span className="text-[#4ade80]">+{stats.added}</span>
          <span className="mx-1 text-[#5a5a5a]">/</span>
          <span className="text-[#f87171]">-{stats.removed}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleView}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[#cccccc] transition-colors hover:bg-[#3c3c3c]"
          title={viewMode === 'edit' ? '查看 diff' : '返回编辑'}
        >
          <FontAwesomeIcon
            icon={viewMode === 'edit' ? faCodeCompare : faPen}
            className="text-[10px]"
          />
          <span>{viewMode === 'edit' ? '查看 diff' : '返回编辑'}</span>
        </button>
        <button
          type="button"
          onClick={onReject}
          className="flex items-center gap-1 rounded border border-[#3c3c3c] bg-[#2a1a1a] px-2 py-0.5 text-[11px] text-[#f87171] transition-colors hover:bg-[#3a2222]"
          title="拒绝：还原到 AI 修改前"
        >
          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
          <span>拒绝</span>
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-1 rounded border border-[#1a6b4a] bg-[#1a6b4a] px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-[#22855e]"
          title="接受并保存到磁盘 (⌘S)"
        >
          <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
          <span>接受并保存</span>
        </button>
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
