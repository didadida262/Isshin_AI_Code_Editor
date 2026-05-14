import Editor from '@monaco-editor/react'
import {
  faFile,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { FileNode } from './FileExplorer'

export type EditorTab = {
  id: string
  name: string
  ext?: string
  content: string
  isDirty?: boolean
}

type Props = {
  tabs: EditorTab[]
  activeTabId: string | null
  onTabClick: (id: string) => void
  onTabClose: (id: string) => void
  onContentChange: (id: string, value: string) => void
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

const WELCOME_CONTENT = `// 欢迎使用 ISShin Code Editor
//
// 在左侧文件管理器中点击文件即可在此处打开
// 支持语法高亮、智能提示等功能
//
// Tip: 在右侧 AI 面板中可以向 ISShin Code AI 提问

`

export function fileNodeToTab(node: FileNode): EditorTab {
  return {
    id: node.id,
    name: node.name,
    ext: node.ext,
    content: WELCOME_CONTENT,
  }
}

export function EditorArea({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onContentChange,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId)

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
      <div className="min-h-0 flex-1">
        {activeTab ? (
          <Editor
            height="100%"
            language={getLanguage(activeTab.ext)}
            value={activeTab.content}
            onChange={(val) => onContentChange(activeTab.id, val ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontLigatures: true,
              lineHeight: 20,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              renderWhitespace: 'selection',
              smoothScrolling: true,
              cursorBlinking: 'phase',
              cursorSmoothCaretAnimation: 'on',
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              renderLineHighlight: 'gutter',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
            }}
          />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-[64px] opacity-10 select-none">{'</>'}</div>
      <p className="text-[13px] text-[#858585]">从左侧资源管理器打开文件</p>
      <p className="text-[11px] text-[#6b6b6b]">或使用右侧 ISShin Code AI 进行对话</p>
    </div>
  )
}
