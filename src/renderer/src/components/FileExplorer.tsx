import {
  faChevronDown,
  faChevronRight,
  faFile,
  faFolder,
  faFolderOpen,
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
  activeFileId: string | null
  onFileClick: (node: FileNode) => void
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

function FileIcon({ node }: { node: FileNode; open?: boolean }) {
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

const MOCK_TREE: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'dir',
    children: [
      {
        id: 'renderer',
        name: 'renderer',
        type: 'dir',
        children: [
          {
            id: 'src2',
            name: 'src',
            type: 'dir',
            children: [
              {
                id: 'api',
                name: 'api',
                type: 'dir',
                children: [
                  { id: 'client.ts', name: 'client.ts', type: 'file', ext: 'ts' },
                  { id: 'enterprise.ts', name: 'enterprise.ts', type: 'file', ext: 'ts' },
                ],
              },
              {
                id: 'components',
                name: 'components',
                type: 'dir',
                children: [
                  { id: 'ActivityBar.tsx', name: 'ActivityBar.tsx', type: 'file', ext: 'tsx' },
                  { id: 'AppBackground.tsx', name: 'AppBackground.tsx', type: 'file', ext: 'tsx' },
                  { id: 'ChatTranscript.tsx', name: 'ChatTranscript.tsx', type: 'file', ext: 'tsx' },
                  { id: 'EditorArea.tsx', name: 'EditorArea.tsx', type: 'file', ext: 'tsx' },
                  { id: 'FileExplorer.tsx', name: 'FileExplorer.tsx', type: 'file', ext: 'tsx' },
                  { id: 'InputBar.tsx', name: 'InputBar.tsx', type: 'file', ext: 'tsx' },
                  { id: 'MarkdownContent.tsx', name: 'MarkdownContent.tsx', type: 'file', ext: 'tsx' },
                  { id: 'StatusBar.tsx', name: 'StatusBar.tsx', type: 'file', ext: 'tsx' },
                ],
              },
              { id: 'App.tsx', name: 'App.tsx', type: 'file', ext: 'tsx' },
              { id: 'main.tsx', name: 'main.tsx', type: 'file', ext: 'tsx' },
              { id: 'index.css', name: 'index.css', type: 'file', ext: 'css' },
            ],
          },
        ],
      },
      {
        id: 'src-tauri',
        name: 'src-tauri',
        type: 'dir',
        children: [
          {
            id: 'tauri-src',
            name: 'src',
            type: 'dir',
            children: [
              { id: 'gateway.rs', name: 'gateway.rs', type: 'file', ext: 'rs' },
              { id: 'document.rs', name: 'document.rs', type: 'file', ext: 'rs' },
              { id: 'lib.rs', name: 'lib.rs', type: 'file', ext: 'rs' },
            ],
          },
          { id: 'Cargo.toml', name: 'Cargo.toml', type: 'file', ext: 'toml' },
          { id: 'tauri.conf.json', name: 'tauri.conf.json', type: 'file', ext: 'json' },
        ],
      },
    ],
  },
  { id: 'package.json', name: 'package.json', type: 'file', ext: 'json' },
  { id: 'README.md', name: 'README.md', type: 'file', ext: 'md' },
  { id: '.gitignore', name: '.gitignore', type: 'file' },
]

export function FileExplorer({ activeFileId, onFileClick }: Omit<Props, 'tree'>) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#252526]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#3c3c3c] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          资源管理器
        </span>
      </div>

      <div className="flex h-7 shrink-0 items-center border-b border-[#3c3c3c] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          project_rag
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {MOCK_TREE.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            activeFileId={activeFileId}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    </div>
  )
}
