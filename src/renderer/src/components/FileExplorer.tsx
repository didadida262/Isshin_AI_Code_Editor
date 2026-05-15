import {
  faChevronDown,
  faChevronRight,
  faFile,
  faFolder,
  faFolderOpen,
  faFolderPlus,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useState } from 'react'

export type FileNode = {
  id: string
  name: string
  type: 'file' | 'dir'
  ext?: string
  children?: FileNode[]
}

type Props = {
  tree: FileNode[]
  folderName: string | null
  activeFileId: string | null
  onFileClick: (node: FileNode) => void
  onOpenFolder: () => void
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
  lock: '#6b7280',
}

function getExtColor(ext?: string) {
  if (!ext) return '#858585'
  return EXT_COLOR[ext.toLowerCase()] ?? '#858585'
}

function FileIcon({ node }: { node: FileNode }) {
  if (node.type === 'dir') return null
  return (
    <FontAwesomeIcon
      icon={faFile}
      style={{ color: getExtColor(node.ext) }}
      className="text-[12px] shrink-0"
    />
  )
}

function TreeNode({
  node,
  depth,
  activeFileId,
  onFileClick,
}: {
  node: FileNode
  depth: number
  activeFileId: string | null
  onFileClick: (n: FileNode) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const isActive = node.id === activeFileId
  const indent = depth * 12 + 8

  if (node.type === 'dir') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group flex w-full items-center gap-1.5 py-[3px] pr-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] focus:outline-none"
          style={{ paddingLeft: indent }}
        >
          <FontAwesomeIcon
            icon={open ? faChevronDown : faChevronRight}
            className="w-2.5 shrink-0 text-[9px] text-[#858585]"
          />
          <FontAwesomeIcon
            icon={open ? faFolderOpen : faFolder}
            className="shrink-0 text-[13px] text-[#e8c080]"
          />
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            activeFileId={activeFileId}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onFileClick(node)}
      className={[
        'flex w-full items-center gap-1.5 py-[3px] pr-2 text-[13px] focus:outline-none',
        isActive
          ? 'bg-[#37373d] text-[#ffffff]'
          : 'text-[#cccccc] hover:bg-[#2a2d2e]',
      ].join(' ')}
      style={{ paddingLeft: indent + 14 }}
    >
      <FileIcon node={node} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileExplorer({ tree, folderName, activeFileId, onFileClick, onOpenFolder }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#252526]">
      {/* 标题栏 */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#3c3c3c] px-3">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          {folderName ?? '未打开文件夹'}
        </span>
        <button
          type="button"
          title="打开文件夹"
          onClick={onOpenFolder}
          className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
        >
          <FontAwesomeIcon icon={faFolderPlus} className="text-[11px]" />
        </button>
      </div>

      {/* 无项目时的占位提示 */}
      {tree.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 py-8">
          <FontAwesomeIcon icon={faFolderOpen} className="text-[28px] text-[#555555]" />
          <p className="text-center text-[12px] text-[#666666]">尚未打开文件夹</p>
          <button
            type="button"
            onClick={onOpenFolder}
            className="rounded-md border border-[#3c3c3c] px-4 py-1.5 text-[12px] text-[#cccccc] transition-colors hover:bg-[#3c3c3c] hover:text-white"
          >
            打开文件夹…
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeFileId={activeFileId}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
