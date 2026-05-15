/** 共享类型（对话消息等） */

/** Agent 工具调用步骤（展示在消息气泡内） */
export type AgentStep = {
  type: 'tool_call' | 'tool_result'
  label: string
  content: string
  toolName?: string
}

/** 用户从编辑器选中并附加到本轮对话的代码片段 */
export type ChatAttachment = {
  id: string
  filePath: string
  fileName: string
  language?: string
  startLine: number
  endLine: number
  code: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** agent 模式下附带的中间步骤 */
  agentSteps?: AgentStep[]
  /** 本条用户消息携带的代码片段（仅 role=user）*/
  attachments?: ChatAttachment[]
}

export type LlmModelOption = {
  path: string
  label: string
  active: boolean
}
