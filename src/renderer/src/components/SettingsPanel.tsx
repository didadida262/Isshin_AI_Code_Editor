import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark, faServer, faCode, faCheck, faRobot, faMagnifyingGlass, faRotate } from '@fortawesome/free-solid-svg-icons'
import type { LlmModelOption } from '../api/client'

export type EditorOptions = {
  fontSize: number
  tabSize: number
  fontFamily: string
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded'
  minimap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  fontLigatures: boolean
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
}

export const DEFAULT_EDITOR_OPTIONS: EditorOptions = {
  fontSize: 13,
  tabSize: 2,
  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
  wordWrap: 'on',
  minimap: true,
  lineNumbers: 'on',
  fontLigatures: true,
  renderWhitespace: 'selection',
  cursorBlinking: 'phase',
}

type SectionId = 'llm' | 'editor' | 'models'

type Props = {
  open: boolean
  onClose: () => void
  baseUrl: string
  apiKey: string
  modelPath: string
  onBaseUrlChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onModelPathChange: (v: string) => void
  editorOptions: EditorOptions
  onEditorOptionsChange: (opts: EditorOptions) => void
  llmModels: LlmModelOption[]
  enabledModelPaths: string[]
  onEnabledModelsChange: (paths: string[]) => void
  onRefreshModels: () => void
}

// ── Primitives ────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[12px] font-medium text-[#cccccc]">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-[#858585]">{children}</p>
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#2a2a2a] py-3.5 last:border-0">
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-[#3c3c3c] bg-[#2d2d2d] px-2.5 py-1.5 text-[13px] text-[#cccccc] placeholder-[#5a5a5a] outline-none transition-colors focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
    />
  )
}

function Toggle({
  checked,
  onChange,
  label = '',
  green = false,
  compact = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  green?: boolean
  /** 模型列表等密集场景用更小轨道 */
  compact?: boolean
}) {
  const track = compact
    ? 'h-[14px] w-[26px]'
    : 'h-[22px] w-10'
  const thumb = compact
    ? 'top-[2px] h-[10px] w-[10px]'
    : 'top-[3px] h-4 w-4'
  const thumbX = compact
    ? (checked ? 'translate-x-[14px]' : 'translate-x-[2px]')
    : (checked ? 'translate-x-[22px]' : 'translate-x-[3px]')

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'flex items-center text-left',
        label ? 'gap-2.5' : 'gap-0',
        compact ? 'shrink-0' : '',
      ].join(' ')}
    >
      <div
        className={[
          'relative shrink-0 rounded-full transition-colors',
          track,
          checked ? (green ? 'bg-[#22c55e]' : 'bg-[#0078d4]') : 'bg-[#5a5a5a]',
        ].join(' ')}
      >
        <span
          className={[
            'absolute rounded-full bg-white shadow-sm transition-transform',
            thumb,
            thumbX,
          ].join(' ')}
        />
      </div>
      {label && <span className="text-[13px] text-[#cccccc]">{label}</span>}
    </button>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10)
        if (!isNaN(n) && n >= min && n <= max) onChange(n)
      }}
      className="w-20 rounded border border-[#3c3c3c] bg-[#2d2d2d] px-2 py-1.5 text-[13px] text-[#cccccc] outline-none transition-colors focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
    />
  )
}

function SelectInput<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded border border-[#3c3c3c] bg-[#2d2d2d] px-2 py-1.5 text-[13px] text-[#cccccc] outline-none transition-colors focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SettingsPanel({
  open,
  onClose,
  baseUrl,
  apiKey,
  modelPath,
  onBaseUrlChange,
  onApiKeyChange,
  onModelPathChange,
  editorOptions,
  onEditorOptionsChange,
  llmModels,
  enabledModelPaths,
  onEnabledModelsChange,
  onRefreshModels,
}: Props) {
  const [activeTab, setActiveTab] = useState<SectionId>('llm')

  // Draft state — only committed on "应用"
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl)
  const [draftApiKey, setDraftApiKey] = useState(apiKey)
  const [draftModelPath, setDraftModelPath] = useState(modelPath)
  const [draftEditor, setDraftEditor] = useState<EditorOptions>(editorOptions)
  const [applied, setApplied] = useState(false)
  const [modelSearch, setModelSearch] = useState('')

  // Reset draft to current committed values whenever panel opens
  useEffect(() => {
    if (open) {
      setDraftBaseUrl(baseUrl)
      setDraftApiKey(apiKey)
      setDraftModelPath(modelPath)
      setDraftEditor(editorOptions)
      setApplied(false)
    }
  }, [open]) // intentionally omit prop dependencies — only reset on open

  // Dirty check
  const llmDirty =
    draftBaseUrl !== baseUrl || draftApiKey !== apiKey || draftModelPath !== modelPath
  const editorDirty = JSON.stringify(draftEditor) !== JSON.stringify(editorOptions)
  const isDirty = llmDirty || editorDirty

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleApply = () => {
    if (llmDirty) {
      onBaseUrlChange(draftBaseUrl)
      onApiKeyChange(draftApiKey)
      onModelPathChange(draftModelPath)
    }
    if (editorDirty) {
      onEditorOptionsChange(draftEditor)
    }
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  const setDraftEditorKey = <K extends keyof EditorOptions>(key: K, val: EditorOptions[K]) => {
    setDraftEditor((prev) => ({ ...prev, [key]: val }))
  }

  const tabDirty: Record<SectionId, boolean> = {
    llm: llmDirty,
    editor: editorDirty,
    models: false,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[540px] w-[720px] max-h-[90vh] max-w-[95vw] overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl">

        {/* Sidebar */}
        <nav className="flex w-44 shrink-0 flex-col border-r border-[#3c3c3c] bg-[#1e1e1e] pt-9">
          <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#5a5a5a]">
            设置
          </div>
            {(
            [
              { id: 'editor' as SectionId, label: '编辑器', icon: faCode },
              { id: 'llm' as SectionId, label: 'LLM 连接', icon: faServer },
              { id: 'models' as SectionId, label: '模型', icon: faRobot },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveTab(s.id)}
              className={[
                'relative flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors',
                activeTab === s.id
                  ? 'bg-[#37373d] text-[#cccccc]'
                  : 'text-[#858585] hover:bg-[#2a2a2a] hover:text-[#aaaaaa]',
              ].join(' ')}
            >
              <FontAwesomeIcon icon={s.icon} className="w-3.5 shrink-0 text-[11px]" />
              {s.label}
              {tabDirty[s.id] && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#0078d4]" />
              )}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#3c3c3c] px-5">
            <span className="text-[13px] font-semibold text-[#cccccc]">
              {activeTab === 'llm' ? 'LLM 连接' : activeTab === 'editor' ? '编辑器' : '模型'}
            </span>
            <button
              type="button"
              onClick={onClose}
              title="关闭"
              className="flex h-6 w-6 items-center justify-center rounded text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
            >
              <FontAwesomeIcon icon={faXmark} className="text-[13px]" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-1">
            {activeTab === 'llm' && (
              <>
                <Row>
                  <FieldLabel>API Base URL</FieldLabel>
                  <TextInput
                    value={draftBaseUrl}
                    onChange={setDraftBaseUrl}
                    placeholder="https://api.openai.com/v1"
                  />
                  <Hint>LLM 服务地址，兼容 OpenAI 格式（Ollama、LM Studio、vLLM 等均可）</Hint>
                </Row>

                <Row>
                  <FieldLabel>API Key</FieldLabel>
                  <TextInput
                    value={draftApiKey}
                    onChange={setDraftApiKey}
                    placeholder="在控制台申请 API Key"
                    type="password"
                  />
                  <Hint>
                    Bearer 认证密钥，请求头格式：
                    <code className="ml-1 rounded bg-[#1e1e1e] px-1 py-0.5 font-mono text-[10px] text-[#9cdcfe]">
                      Authorization: Bearer &lt;api_key&gt;
                    </code>
                  </Hint>
                </Row>

                <Row>
                  <FieldLabel>模型标识（model）</FieldLabel>
                  <TextInput
                    value={draftModelPath}
                    onChange={setDraftModelPath}
                    placeholder="例如 minimax-m2.7（与上游 OpenAI 兼容接口一致）"
                  />
                  <Hint>
                    与 Nexus 模型列表中的标识一致；可在侧边栏下拉或「模型」页勾选列表；也可手动填写未出现在列表中的 model。
                  </Hint>
                </Row>

              </>
            )}

            {activeTab === 'models' && (() => {
              const filtered = llmModels.filter((m) =>
                m.label.toLowerCase().includes(modelSearch.toLowerCase()) ||
                m.path.toLowerCase().includes(modelSearch.toLowerCase()),
              )
              return (
                <>
                  <div className="flex items-center gap-2 border-b border-[#2a2a2a] py-3">
                    <div className="relative flex-1">
                      <FontAwesomeIcon
                        icon={faMagnifyingGlass}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#5a5a5a]"
                      />
                      <input
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="搜索模型"
                        className="w-full rounded border border-[#3c3c3c] bg-[#2d2d2d] py-1.5 pl-7 pr-2.5 text-[13px] text-[#cccccc] placeholder-[#5a5a5a] outline-none transition-colors focus:border-[#555555]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onRefreshModels}
                      title="刷新模型列表"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#3c3c3c] bg-[#2d2d2d] text-[#858585] transition-colors hover:border-[#555555] hover:text-[#cccccc]"
                    >
                      <FontAwesomeIcon icon={faRotate} className="text-[12px]" />
                    </button>
                  </div>

                  <div className="py-1">
                    {filtered.length === 0 && (
                      <p className="py-8 text-center text-[12px] text-[#5a5a5a]">
                        {llmModels.length === 0
                          ? '请先配置 API Key 并应用后拉取列表（https://aiplatform.njsrd.com/nexus/…）'
                          : '未找到匹配的模型'}
                      </p>
                    )}
                    {filtered.map((model) => {
                      const enabled = enabledModelPaths.includes(model.path)
                      return (
                        <div
                          key={model.path}
                          className="flex min-h-0 items-center gap-2 border-b border-[#2a2a2a] py-2 last:border-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-[#cccccc]">
                            {model.label}
                          </span>
                          <Toggle
                            checked={enabled}
                            compact
                            green
                            onChange={(v) => {
                              const next = v
                                ? [...enabledModelPaths, model.path]
                                : enabledModelPaths.filter((p) => p !== model.path)
                              onEnabledModelsChange(next)
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}

            {activeTab === 'editor' && (
              <>
                <Row>
                  <FieldLabel>字体大小（Font Size）</FieldLabel>
                  <NumberInput
                    value={draftEditor.fontSize}
                    onChange={(v) => setDraftEditorKey('fontSize', v)}
                    min={8}
                    max={32}
                  />
                  <Hint>编辑器字体大小（px），范围 8–32</Hint>
                </Row>
                <Row>
                  <FieldLabel>Tab 宽度（Tab Size）</FieldLabel>
                  <NumberInput
                    value={draftEditor.tabSize}
                    onChange={(v) => setDraftEditorKey('tabSize', v)}
                    min={1}
                    max={8}
                  />
                  <Hint>每个 Tab 等效的空格数，范围 1–8</Hint>
                </Row>
                <Row>
                  <FieldLabel>字体族（Font Family）</FieldLabel>
                  <TextInput
                    value={draftEditor.fontFamily}
                    onChange={(v) => setDraftEditorKey('fontFamily', v)}
                    placeholder="'JetBrains Mono', Consolas, monospace"
                  />
                  <Hint>CSS font-family 格式，多个字体名用逗号分隔</Hint>
                </Row>
                <Row>
                  <FieldLabel>自动换行（Word Wrap）</FieldLabel>
                  <SelectInput
                    value={draftEditor.wordWrap}
                    onChange={(v) => setDraftEditorKey('wordWrap', v)}
                    options={[
                      { value: 'on', label: '开启（始终换行）' },
                      { value: 'off', label: '关闭（横向滚动）' },
                      { value: 'bounded', label: '有界（取视口与列数较小值）' },
                    ]}
                  />
                </Row>
                <Row>
                  <FieldLabel>行号（Line Numbers）</FieldLabel>
                  <SelectInput
                    value={draftEditor.lineNumbers}
                    onChange={(v) => setDraftEditorKey('lineNumbers', v)}
                    options={[
                      { value: 'on', label: '绝对行号' },
                      { value: 'relative', label: '相对行号' },
                      { value: 'off', label: '隐藏' },
                    ]}
                  />
                </Row>
                <Row>
                  <FieldLabel>光标动画（Cursor Blinking）</FieldLabel>
                  <SelectInput
                    value={draftEditor.cursorBlinking}
                    onChange={(v) => setDraftEditorKey('cursorBlinking', v)}
                    options={[
                      { value: 'phase', label: 'Phase（渐隐渐显）' },
                      { value: 'blink', label: 'Blink（规则闪烁）' },
                      { value: 'smooth', label: 'Smooth（平滑淡入淡出）' },
                      { value: 'expand', label: 'Expand（扩展收缩）' },
                      { value: 'solid', label: 'Solid（常亮不闪）' },
                    ]}
                  />
                </Row>
                <Row>
                  <Toggle
                    checked={draftEditor.minimap}
                    onChange={(v) => setDraftEditorKey('minimap', v)}
                    label="显示缩略图（Minimap）"
                  />
                </Row>
                <Row>
                  <Toggle
                    checked={draftEditor.fontLigatures}
                    onChange={(v) => setDraftEditorKey('fontLigatures', v)}
                    label="字体连字（Font Ligatures）"
                  />
                  <Hint>需要 JetBrains Mono / Fira Code 等支持连字的等宽字体</Hint>
                </Row>
                <Row>
                  <FieldLabel>空白符显示（Render Whitespace）</FieldLabel>
                  <SelectInput
                    value={draftEditor.renderWhitespace}
                    onChange={(v) => setDraftEditorKey('renderWhitespace', v)}
                    options={[
                      { value: 'none', label: '不显示' },
                      { value: 'selection', label: '选中时显示' },
                      { value: 'boundary', label: '单词边界' },
                      { value: 'trailing', label: '仅行尾空白' },
                      { value: 'all', label: '全部显示' },
                    ]}
                  />
                </Row>
              </>
            )}
          </div>

          {/* Footer: Apply / Cancel — 模型页为即时操作 */}
          {activeTab !== 'models' && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#3c3c3c] px-5 py-3">
            <span className="text-[11px] text-[#5a5a5a]">
              {isDirty
                ? '有未应用的更改'
                : applied
                  ? ''
                  : ''}
            </span>
            <div className="flex items-center gap-2">
              {isDirty && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftBaseUrl(baseUrl)
                    setDraftApiKey(apiKey)
                    setDraftModelPath(modelPath)
                    setDraftEditor(editorOptions)
                  }}
                  className="rounded px-3 py-1.5 text-[12px] text-[#858585] transition-colors hover:bg-[#3c3c3c] hover:text-[#cccccc]"
                >
                  重置
                </button>
              )}
              <button
                type="button"
                onClick={handleApply}
                disabled={!isDirty && !applied}
                className={[
                  'flex items-center gap-1.5 rounded px-4 py-1.5 text-[12px] font-medium transition-colors',
                  applied && !isDirty
                    ? 'bg-[#1a6b4a]/30 text-[#4ade80] ring-1 ring-[#1a6b4a]/60 cursor-default'
                    : isDirty
                      ? 'bg-[#0078d4] text-white hover:bg-[#006cbd]'
                      : 'cursor-default bg-[#3c3c3c] text-[#5a5a5a]',
                ].join(' ')}
              >
                {applied && !isDirty ? (
                  <>
                    <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                    已应用
                  </>
                ) : (
                  '应用'
                )}
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
