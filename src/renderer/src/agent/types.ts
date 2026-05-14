/**
 * Agent 状态机类型定义
 * 对应 my_codegen_agent/schema.py 的 TypeScript 移植版本，
 * 并扩展为支持 OpenAI function-calling 协议的多工具 Code Agent。
 */

// ── Tool 定义 ────────────────────────────────────────────────────

export type ToolName = 'list_files' | 'read_file' | 'write_file'

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: ToolName
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, ToolParameter>
      required: string[]
    }
  }
}

// ── LLM 消息协议（OpenAI 格式）────────────────────────────────────

export interface LlmToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmMessage {
  role: LlmRole
  content: string | null
  tool_calls?: LlmToolCall[]
  tool_call_id?: string
  name?: string
}

export interface LlmChatResponse {
  message: LlmMessage
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
}

// ── Agent 状态（对应 GraphState）────────────────────────────────────

export interface AgentState {
  /** 完整对话历史（含 system / user / assistant / tool 角色） */
  messages: LlmMessage[]
  /** 当前已迭代次数（对应 iterations） */
  iterations: number
  /** 是否已结束 */
  done: boolean
  /** 最后一次错误信息（对应 error_message） */
  error?: string
}

// ── Agent 运行时事件（用于 UI 流式渲染）──────────────────────────────

export type AgentEventType =
  | 'thinking'    // LLM 输出的 thought（如使用 CoT 模型时）
  | 'tool_call'   // 调用工具
  | 'tool_result' // 工具执行结果
  | 'answer'      // 最终回答（流式 token）
  | 'done'        // 整轮结束
  | 'error'       // 错误

export interface AgentEvent {
  type: AgentEventType
  /** 展示文字 */
  label: string
  /** 详细内容 */
  content: string
  /** 关联工具名（tool_call / tool_result 时有效） */
  toolName?: ToolName | string
}

// ── UI 展示用的 AgentStep（挂在 ChatMessage.agentSteps 上）──────────

export interface AgentStep {
  type: 'tool_call' | 'tool_result'
  label: string
  content: string
  toolName?: string
}

// ── 工具上下文（由外部注入，解耦文件系统实现）──────────────────────────

export interface ToolContext {
  /** 列出所有可用文件 path 列表 */
  listFiles: () => string[]
  /** 读取文件内容；不存在返回 null */
  readFile: (path: string) => string | null
  /** 写入文件（新建 or 覆盖），同时更新编辑器 tab */
  writeFile: (path: string, content: string) => void
  /** 获取当前激活文件 */
  getActiveFile: () => { path: string; content: string } | null
}
