import { faCircleNotch, faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

export type WorkspaceSearchHit = {
  path: string
  line: number
  preview: string
}

type Props = {
  folderPath: string | null
  onOpenFolder: () => void
  onOpenResult: (path: string) => void
}

export function SearchPanel({ folderPath, onOpenFolder, onOpenResult }: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [filesOnly, setFilesOnly] = useState(false)
  const [hits, setHits] = useState<WorkspaceSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState<string | null>(null)

  useEffect(() => {
    setHits([])
    setError(null)
    setLastSubmittedQuery(null)
  }, [folderPath])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      setLastSubmittedQuery(null)
    }
  }, [query])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!folderPath || !q) {
      setHits([])
      setError(null)
      setLastSubmittedQuery(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await invoke<WorkspaceSearchHit[]>('workspace_search', {
        root: folderPath,
        query: q,
        caseSensitive,
        filesOnly,
      })
      setHits(res)
      setLastSubmittedQuery(q)
    } catch (e) {
      setHits([])
      setLastSubmittedQuery(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [folderPath, query, caseSensitive, filesOnly])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#252526] text-[#cccccc]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#3c3c3c] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#bbbbbb]">
          搜索
        </span>
      </div>

      {!folderPath ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-6 text-center text-[13px] text-[#858585]">
          <p>请先打开文件夹以在工作区内搜索。</p>
          <button
            type="button"
            onClick={onOpenFolder}
            className="flex items-center gap-2 rounded border border-[#3c3c3c] bg-[#2d2d2d] px-3 py-2 text-[12px] text-[#cccccc] transition-colors hover:bg-[#3c3c3c]"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="text-[12px]" />
            打开文件夹
          </button>
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-[#3c3c3c] px-2 py-2">
            <input
              type="text"
              value={query}
              placeholder="搜索"
              aria-label="搜索关键字"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch()
              }}
              className="w-full rounded border border-[#3c3c3c] bg-[#3c3c3c] px-2 py-1.5 text-[13px] text-[#cccccc] outline-none placeholder:text-[#858585] focus:border-[#0078d4]"
            />
            <label className="flex cursor-pointer items-center gap-2 px-1 text-[12px] text-[#cccccc]">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-[#0078d4]"
              />
              区分大小写
            </label>
            <label className="flex cursor-pointer items-center gap-2 px-1 text-[12px] text-[#cccccc]">
              <input
                type="checkbox"
                checked={filesOnly}
                onChange={(e) => setFilesOnly(e.target.checked)}
                className="accent-[#0078d4]"
              />
              仅文件名
            </label>
            <button
              type="button"
              disabled={loading || !query.trim()}
              onClick={() => void runSearch()}
              className="w-full rounded bg-[#0e639c] px-2 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1177bb] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <FontAwesomeIcon icon={faCircleNotch} spin className="text-[12px]" />
                  搜索中…
                </span>
              ) : (
                '搜索'
              )}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
            {error && (
              <div className="rounded bg-[#5a1d1d]/40 px-2 py-2 text-[12px] text-[#f48771]">{error}</div>
            )}
            {!error &&
              hits.length === 0 &&
              !loading &&
              lastSubmittedQuery !== null &&
              query.trim() === lastSubmittedQuery && (
                <p className="px-2 py-4 text-center text-[12px] text-[#858585]">未找到结果</p>
              )}
            {!query.trim() && !loading && (
              <p className="px-2 py-4 text-center text-[12px] text-[#858585]">输入关键字后按 Enter 或点击搜索</p>
            )}
            <ul className="space-y-0.5">
              {hits.map((h, i) => (
                <li key={`${h.path}:${h.line}:${i}`}>
                  <button
                    type="button"
                    onClick={() => onOpenResult(h.path)}
                    className="w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-[#2a2d2e]"
                  >
                    <div className="truncate text-[11px] text-[#569cd6]" title={h.path}>
                      {h.path.split(/[/\\]/).pop() ?? h.path}
                      {h.line > 0 ? (
                        <span className="text-[#858585]">
                          {' '}
                          :{h.line}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[11px] text-[#cccccc]/90" title={h.preview}>
                      {h.preview}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
