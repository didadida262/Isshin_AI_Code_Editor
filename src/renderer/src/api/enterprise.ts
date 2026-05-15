/**
 * 企业平台开放接口 + 外部 LLM（baseUrl + `/llm/v1/...`）。
 * 普通会话与附件会话均经本机 Axum 网关（默认 8787）`POST /enterprise/api/v1/chat/completions`，
 * 由 Rust 后端带上 `X-Llm-Base-Url` 转发上游，避免浏览器对第三方域名的 CORS。
 */


function trimOrigin(raw: string | undefined): string {
  if (raw == null) return ''
  const t = raw.replace(/\/$/, '').trim()
  return t
}

/** 用户填写的平台根地址，如 `https://aiplatform.njsrd.com`（无尾斜杠） */
export function normalizeLlmBaseUrl(raw: string | undefined): string {
  return trimOrigin(raw)
}

/**
 * 规范为 LLM API 前缀（无尾斜杠），形态固定为 `{scheme}://{host}/llm/v1`。
 * - 只填域名时自动补 `/llm/v1`；
 * - 误填完整 `.../llm/v1/chat/completions` 时裁成 `.../llm/v1`；
 * - 多段 `.../llm/v1/llm/v1` 会折叠为单段 `/llm/v1`。
 */
export function normalizeLlmApiPrefix(baseUrl: string): string {
  let s = normalizeLlmBaseUrl(baseUrl)
  if (!s) return ''
  if (s.endsWith('/llm/v1/chat/completions')) {
    s = s.slice(0, -'/chat/completions'.length).replace(/\/$/, '')
  }
  const llmV1 = '/llm/v1'
  while (s.endsWith(llmV1)) {
    s = s.slice(0, -llmV1.length).replace(/\/$/, '')
  }
  return `${s}${llmV1}`.replace(/\/$/, '')
}

/**
 * 带 PDF/DOCX 时须 POST 到本机（同一路径 `/enterprise/.../chat/completions` + multipart），
 * 由网关解析后再 JSON 转发上游。
 */
function getLocalMiddlewareOrigin(): string {
  const proxy = trimOrigin(import.meta.env.VITE_API_PROXY_URL)
  if (proxy) return proxy

  return 'http://127.0.0.1:8787'
}

/** Nexus 模型列表（公网 HTTPS，随 api_key 拉取） */
export const MODEL_SERVICES_LIST_URL =
  'https://aiplatform.njsrd.com/nexus/api/model-services?pageNum=1&pageSize=999'

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

function extractRows(payload: unknown): unknown[] {
  if (payload == null) return []
  if (Array.isArray(payload)) return payload
  if (typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>

  const inner = o.data !== undefined ? o.data : o
  if (Array.isArray(inner)) return inner
  if (typeof inner !== 'object' || inner === null) return []

  const box = inner as Record<string, unknown>
  const nests = ['records', 'list', 'rows', 'content', 'items', 'data']
  for (const k of nests) {
    const v = box[k]
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>
      for (const nk of nests) {
        const arr = nested[nk]
        if (Array.isArray(arr)) return arr
      }
    }
  }
  return []
}

export type EnterpriseModelOption = {
  path: string
  label: string
  active: boolean
}

function rowToModelOption(row: unknown): EnterpriseModelOption | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const path = pickStr(r, [
    'modelPath',
    'path',
    'serviceId',
    'id',
    'modelId',
    'code',
    'modelCode',
    'uuid',
    'name',
    'model_name',
  ])
  if (!path) return null
  const label =
    pickStr(r, [
      'name',
      'modelName',
      'serviceName',
      'title',
      'label',
      'displayName',
    ]) || path
  return { path, label, active: false }
}

function buildEnterpriseAuthHeaders(token: string, apiKey: string): Headers {
  const h = new Headers()
  h.set('Accept', 'application/json, text/plain, */*')
  const auth = authorizationBearer(token)
  if (auth) h.set('Authorization', auth)
  const k = apiKey.trim()
  if (k) {
    h.set('X-Api-Key', k)
  }
  return h
}

export async function fetchLlmModels(apiKey: string): Promise<EnterpriseModelOption[]> {
  if (!apiKey.trim()) return []
  const res = await fetch(MODEL_SERVICES_LIST_URL, {
    method: 'GET',
    headers: buildEnterpriseAuthHeaders('', apiKey.trim()),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `model-services HTTP ${res.status}`)
  }
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new Error('model-services 返回非 JSON')
  }
  const rows = extractRows(json)
  const out: EnterpriseModelOption[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const opt = rowToModelOption(row)
    if (opt && !seen.has(opt.path)) {
      seen.add(opt.path)
      out.push(opt)
    }
  }
  return out
}

/**
 * 与平台 Web 一致：JWT 走 Authorization Bearer，密钥走 X-Api-Key。
 */
export function authorizationBearer(token: string): string {
  const t = token.trim()
  if (!t) return ''
  return /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`
}

export type EnterpriseChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * 解析 OpenAI 兼容 SSE：`data:` 行 JSON 中 `choices[0].delta.content`（或 `reasoning_content`）。
 */
export async function consumeOpenAiCompatibleSseStream(
  res: Response,
  onToken: (text: string) => void,
): Promise<void> {
  const resBody = res.body
  if (!resBody) {
    const text = await res.text().catch(() => '')
    if (!text.trim()) throw new Error('响应无正文')
    let j: unknown
    try {
      j = JSON.parse(text)
    } catch {
      throw new Error(text)
    }
    const o = j as {
      error?: { message?: string }
      choices?: Array<{ message?: { content?: string } }>
    }
    if (o.error?.message) throw new Error(o.error.message)
    const c = o.choices?.[0]?.message?.content
    if (typeof c === 'string' && c) {
      onToken(c)
      return
    }
    throw new Error(text)
  }

  const reader = resBody.getReader()
  const decoder = new TextDecoder()
  let carry = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    carry += decoder.decode(value, { stream: true })
    const lines = carry.split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      if (!data) continue
      let json: Record<string, unknown>
      try {
        json = JSON.parse(data) as Record<string, unknown>
      } catch {
        continue
      }
      const errObj = json.error as { message?: string } | undefined
      if (errObj && typeof errObj.message === 'string') {
        throw new Error(errObj.message)
      }
      const choices = json.choices as
        | Array<{
            delta?: {
              content?: string
              reasoning_content?: string
            }
          }>
        | undefined
      const delta = choices?.[0]?.delta
      const piece = delta?.content ?? delta?.reasoning_content
      if (typeof piece === 'string' && piece.length > 0) onToken(piece)
    }
  }

  if (carry.trim()) {
    const trimmed = carry.trim()
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim()
      if (data && data !== '[DONE]') {
        try {
          const json = JSON.parse(data) as Record<string, unknown>
          const choices = json.choices as
            | Array<{ delta?: { content?: string } }>
            | undefined
          const piece = choices?.[0]?.delta?.content
          if (typeof piece === 'string' && piece) onToken(piece)
        } catch {
          /* ignore */
        }
      }
    }
  }
}

async function consumeLlmChatCompletionsResponse(
  res: Response,
  onToken: (text: string) => void,
): Promise<void> {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    await consumeOpenAiCompatibleSseStream(res, onToken)
    return
  }
  const text = await res.text()
  let j: unknown
  try {
    j = JSON.parse(text) as Record<string, unknown>
  } catch {
    if (text.trim()) throw new Error(text.slice(0, 500))
    throw new Error('空响应')
  }
  const o = j as {
    error?: { message?: string }
    choices?: Array<{
      message?: { content?: string }
      delta?: { content?: string; reasoning_content?: string }
    }>
  }
  if (o.error?.message) throw new Error(o.error.message)
  const c0 = o.choices?.[0]
  const msg = c0?.message?.content
  if (typeof msg === 'string' && msg) {
    onToken(msg)
    return
  }
  const delta = c0?.delta
  const piece = delta?.content ?? delta?.reasoning_content
  if (typeof piece === 'string' && piece) {
    onToken(piece)
    return
  }
  throw new Error(text.slice(0, 400) || '无法解析模型回复')
}

/**
 * `POST` 本机网关 `/enterprise/api/v1/chat/completions`（JSON），由服务端按 `X-Llm-Base-Url` 转发上游
 * `{prefix}/chat/completions`，避免浏览器直连第三方时的 CORS。
 */
export async function streamLlmChatCompletions(
  baseUrl: string,
  apiKey: string,
  params: {
    model: string
    messages: EnterpriseChatMessage[]
    /** 请求 JSON 的 `stream`，默认 `true` */
    stream?: boolean
    signal?: AbortSignal
    onToken: (text: string) => void
  },
): Promise<void> {
  const { model, messages, signal, onToken, stream: streamParam } = params
  const stream = streamParam !== false
  if (!normalizeLlmBaseUrl(baseUrl)) {
    throw new Error('请填写 baseUrl（如 https://aiplatform.njsrd.com/llm/v1）')
  }
  if (!apiKey.trim()) {
    throw new Error('请填写 api_key（将使用 Authorization: Bearer）')
  }
  const llmApiPrefix = normalizeLlmApiPrefix(baseUrl)
  if (!llmApiPrefix) {
    throw new Error('baseUrl 不是合法 http(s) 地址')
  }

  const origin = getLocalMiddlewareOrigin().replace(/\/$/, '')
  const url = `${origin}/enterprise/api/v1/chat/completions`

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set(
    'Accept',
    stream ? 'application/json, text/event-stream' : 'application/json',
  )
  headers.set('Authorization', authorizationBearer(apiKey.trim()))
  headers.set('X-Llm-Base-Url', llmApiPrefix)

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream,
    }),
    signal,
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `chat/completions HTTP ${res.status}`)
  }

  await consumeLlmChatCompletionsResponse(res, onToken)
}

/**
 * 附件经本机解析后转发到 `{API 前缀}/chat/completions`（请求头 `X-Llm-Base-Url` + Bearer）。
 */
export async function streamLlmChatCompletionsWithDocument(
  baseUrl: string,
  apiKey: string,
  params: {
    model: string
    messages: EnterpriseChatMessage[]
    file: File
    /** multipart 的 `stream` 字段，默认 `true` */
    stream?: boolean
    signal?: AbortSignal
    onToken: (text: string) => void
  },
): Promise<void> {
  const { model, messages, file, signal, onToken, stream: streamParam } = params
  const stream = streamParam !== false
  if (!apiKey.trim()) {
    throw new Error('请填写 api_key（Authorization: Bearer）')
  }
  const llmApiPrefix = normalizeLlmApiPrefix(baseUrl)
  if (!llmApiPrefix) {
    throw new Error(
      '请填写 baseUrl；附件仅在本机解析，再由网关转发到该前缀下的 /chat/completions',
    )
  }
  if (!model.trim()) {
    throw new Error('请选择模型')
  }

  const origin = getLocalMiddlewareOrigin().replace(/\/$/, '')
  const url = `${origin}/enterprise/api/v1/chat/completions`

  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', model.trim())
  fd.append('messages', JSON.stringify(messages))
  fd.append('stream', stream ? 'true' : 'false')

  const headers = new Headers()
  headers.set('Authorization', authorizationBearer(apiKey.trim()))
  headers.set('X-Llm-Base-Url', llmApiPrefix)
  headers.set(
    'Accept',
    stream ? 'application/json, text/event-stream' : 'application/json',
  )

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: fd,
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text || `chat/completions HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      if (j.error?.message) msg = j.error.message
    } catch {
      /* keep */
    }
    throw new Error(msg)
  }

  await consumeLlmChatCompletionsResponse(res, onToken)
}

// ── Tool-Calling（非流式）────────────────────────────────────────────

import type { LlmMessage, LlmChatResponse, ToolDefinition } from '../agent/types'

/**
 * 非流式 LLM 调用，支持 OpenAI function-calling 协议。
 * 对应 my_codegen_agent/nodes.py 中 model.invoke(prompt) 的工具化版本。
 * 返回完整的 message 对象（含 tool_calls 或纯文本 content）。
 */
export async function callLlmWithTools(
  baseUrl: string,
  apiKey: string,
  params: {
    model: string
    messages: LlmMessage[]
    tools?: ToolDefinition[]
    signal?: AbortSignal
  },
): Promise<LlmChatResponse> {
  const { model, messages, tools, signal } = params

  const llmApiPrefix = normalizeLlmApiPrefix(baseUrl)
  if (!llmApiPrefix) throw new Error('baseUrl 不合法')
  if (!apiKey.trim()) throw new Error('请填写 api_key')

  const origin = getLocalMiddlewareOrigin().replace(/\/$/, '')
  const url = `${origin}/enterprise/api/v1/chat/completions`

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  headers.set('Authorization', authorizationBearer(apiKey.trim()))
  headers.set('X-Llm-Base-Url', llmApiPrefix)

  const body: Record<string, unknown> = { model, messages, stream: false }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text || `chat/completions HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      if (j.error?.message) msg = j.error.message
    } catch { /* keep */ }
    throw new Error(msg)
  }

  const json = await res.json() as {
    choices?: Array<{
      message: LlmMessage
      finish_reason: string
    }>
  }

  const choice = json.choices?.[0]
  if (!choice) throw new Error('模型未返回有效响应')

  return {
    message: choice.message,
    finish_reason: choice.finish_reason ?? 'stop',
  }
}

// ── Python Agent SSE 客户端 ──────────────────────────────────────────

import type { AgentEvent } from '../agent/types'

const AGENT_SERVER_URL = 'http://127.0.0.1:8788'

export interface AgentStreamParams {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  files: Record<string, string>
  activeFile: string | null
  model: string
  baseUrl: string
  apiKey: string
  signal?: AbortSignal
}

export interface AgentStreamCallbacks {
  onStep: (event: AgentEvent) => void
  onWriteFile: (path: string, content: string) => void
  onToken: (token: string) => void
  onDone: () => void
  onError: (msg: string) => void
}

/**
 * 调用 Python FastAPI 后端 /agent/stream，消费 SSE 流。
 * 生产模式下 Python 以 Tauri sidecar 运行；开发模式下手动启动：
 *   cd backend && uvicorn main:app --port 8788 --reload
 */
export async function streamAgentFromPython(
  params: AgentStreamParams,
  callbacks: AgentStreamCallbacks,
): Promise<void> {
  const { userMessage, history, files, activeFile, model, baseUrl, apiKey, signal } = params
  const { onStep, onWriteFile, onToken, onDone, onError } = callbacks

  const res = await fetch(`${AGENT_SERVER_URL}/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_message: userMessage,
      history,
      files,
      active_file: activeFile,
      model,
      base_url: baseUrl,
      api_key: apiKey,
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `agent/stream HTTP ${res.status}`)
  }

  if (!res.body) throw new Error('agent/stream: 无响应体')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // 按空行分割 SSE 消息块
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.trim()) continue

      let eventType = 'message'
      let dataLine = ''

      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLine = line.slice(5).trim()
        }
      }

      if (!dataLine) continue

      let data: Record<string, unknown>
      try {
        data = JSON.parse(dataLine) as Record<string, unknown>
      } catch {
        continue
      }

      switch (eventType) {
        case 'tool_call':
          onStep({
            type: 'tool_call',
            label: String(data.display ?? `调用工具: ${data.tool}`),
            content: JSON.stringify(data.args ?? {}),
            toolName: String(data.tool ?? ''),
          })
          break

        case 'tool_result':
          onStep({
            type: 'tool_result',
            label: String(data.display ?? '执行完成'),
            content: String(data.display ?? ''),
            toolName: String(data.tool ?? ''),
          })
          break

        case 'write_file':
          onWriteFile(String(data.path ?? ''), String(data.content ?? ''))
          break

        case 'token':
          onToken(String(data.content ?? ''))
          break

        case 'done':
          onDone()
          return

        case 'error':
          onError(String(data.message ?? '未知错误'))
          return
      }
    }
  }

  onDone()
}
