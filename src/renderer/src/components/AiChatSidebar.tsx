import {
  faClockRotateLeft,
  faEllipsisH,
  faPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useState } from 'react'
import type { ChatMessage, LlmModelOption } from '../api/client'
import { ChatTranscript } from './ChatTranscript'
import { InputBar } from './InputBar'

type Props = {
  messages: ChatMessage[]
  warnings: string[]
  streaming: boolean
  input: string
  llmModels: LlmModelOption[]
  selectedModelPath: string
  onModelChange: (path: string) => void
  onInputChange: (v: string) => void
  onSubmit: () => void
  onStop: () => void
  onRegenerate: (index: number) => void
  onUserEditSubmit: (index: number, text: string) => void
  width?: number
}

type Tab = { id: string; label: string }

export function AiChatSidebar({
  messages,
  warnings,
  streaming,
  input,
  llmModels,
  selectedModelPath,
  onModelChange,
  onInputChange,
  onSubmit,
  onStop,
  onRegenerate,
  onUserEditSubmit,
  width = 340,
}: Props) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'default', label: 'New Agent' }])
  const [activeTabId, setActiveTabId] = useState('default')

  const addTab = () => {
    const id = `tab-${Date.now()}`
    setTabs((prev) => [...prev, { id, label: 'New Agent' }])
    setActiveTabId(id)
  }

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        const fresh = { id: `tab-${Date.now()}`, label: 'New Agent' }
        setActiveTabId(fresh.id)
        return [fresh]
      }
      if (activeTabId === id) setActiveTabId(next[next.length - 1].id)
      return next
    })
  }

  return (
    <aside className="flex h-full shrink-0 flex-col overflow-hidden bg-[#1a1a1a]" style={{ width }}>
      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-[#3c3c3c] bg-[#1a1a1a]">
        {/* Scrollable tabs */}
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={[
                  'group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-[#3c3c3c] px-3 text-[12px] transition-colors border-b-2',
                  isActive
                    ? 'bg-[#252526] text-[#cccccc] border-b-[#252526]'
                    : 'text-[#858585] hover:bg-[#252526]/60 hover:text-[#aaaaaa] border-b-transparent',
                ].join(' ')}
              >
                <span className="max-w-[100px] truncate">{tab.label}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[#3c3c3c] group-hover:opacity-60 hover:!opacity-100"
                  aria-label="关闭"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-[9px]" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-0.5 px-1.5">
          <button
            type="button"
            title="新建对话"
            onClick={addTab}
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-[11px]" />
          </button>
          <button
            type="button"
            title="历史对话"
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-[11px]" />
          </button>
          <button
            type="button"
            title="更多"
            className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            <FontAwesomeIcon icon={faEllipsisH} className="text-[11px]" />
          </button>
        </div>
      </div>

      {/* Chat transcript */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatTranscript
          messages={messages}
          streaming={streaming}
          onRegenerate={onRegenerate}
          onUserEditSubmit={onUserEditSubmit}
          compact
        />
      </div>

      {/* Input bar */}
      <InputBar
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        streaming={streaming}
        onStop={onStop}
        models={llmModels}
        selectedModelPath={selectedModelPath}
        onModelChange={onModelChange}
      />
    </aside>
  )
}
