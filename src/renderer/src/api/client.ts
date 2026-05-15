/** 共享类型（对话消息等） */

/** Agent 工具调用步骤（展示在消息气泡内） */
export type AgentStep = {
  type: 'tool_call' | 'tool_result'
  label: string
  content: string
  toolName?: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** agent 模式下附带的中间步骤 */
  agentSteps?: AgentStep[]
}

export type LlmModelOption = {
  path: string
  label: string
  active: boolean
}
