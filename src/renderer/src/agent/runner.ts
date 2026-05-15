/**
 * Agent 状态图主循环
 *
 * 对应 my_codegen_agent/main.py + nodes.py 的完整移植：
 *
 *   generate_node  ←──────────────┐
 *        │                        │
 *        ▼                        │  (has tool_calls)
 *   execute_node                  │
 *        │                        │
 *        ▼                        │
 *   decide_next_step ─────────────┘
 *        │
 *        ▼ (done / max_iterations)
 *       END
 *
 * 扩展：
 * - 工具为文件读写（非 Python exec），实现编辑器代码修改
 * - 通过 AsyncGenerator 向 UI 推送中间事件（thinking / tool_call / tool_result / answer）
 * - System Prompt 包含编辑器上下文，使 LLM 了解文件结构
 */

import { callLlmWithTools } from '../api/enterprise'
import type { LlmMessage } from './types'
import type { AgentState, AgentEvent, ToolContext } from './types'
import { TOOL_DEFINITIONS, executeToolCall } from './tools'

const MAX_ITERATIONS = 8

// ── System Prompt ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ToolContext): string {
  const files = ctx.listFiles()
  const fileList = files.length > 0
    ? `当前编辑器中已打开的文件：\n${files.map(f => `  - ${f}`).join('\n')}`
    : '当前编辑器中没有打开的文件。'

  const active = ctx.getActiveFile()
  const activeHint = active
    ? `\n当前激活文件：${active.path}`
    : ''

  return `你是 Isshin AI Code Editor，一个专业的代码助手，直接集成在代码编辑器中。

你可以使用以下工具来读取和修改编辑器中的文件：
- list_files：列出所有可用文件
- read_file：读取指定文件的完整内容
- write_file：写入/覆盖文件（需提供完整内容）

工作原则：
1. 修改文件前，先用 read_file 读取现有内容，充分理解代码结构
2. 使用 write_file 时，必须提供完整的文件内容，不能只写部分代码
3. 每次操作前先思考（Thought），再行动（Action）
4. 优先进行最小化、精准的修改
5. 完成后简洁说明做了什么改动

${fileList}${activeHint}`
}

// ── Node 1：generate_code_node（调用 LLM）────────────────────────────

async function generateNode(
  state: AgentState,
  config: { baseUrl: string; apiKey: string; model: string; signal?: AbortSignal },
) {
  const response = await callLlmWithTools(config.baseUrl, config.apiKey, {
    model: config.model,
    messages: state.messages,
    tools: TOOL_DEFINITIONS,
    signal: config.signal,
  })
  return response
}

// ── Node 2：execute_code_node（执行工具调用）─────────────────────────

function executeNode(
  toolCalls: NonNullable<LlmMessage['tool_calls']>,
  ctx: ToolContext,
) {
  return toolCalls.map((tc) => {
    const result = executeToolCall(tc, ctx)
    return {
      toolCall: tc,
      result,
    }
  })
}

// ── 路由（decide_next_step）──────────────────────────────────────────

type NextStep = 'continue' | 'answer' | 'end'

function decideNextStep(
  finishReason: string,
  iterations: number,
): NextStep {
  if (iterations >= MAX_ITERATIONS) return 'end'
  if (finishReason === 'tool_calls') return 'continue'
  return 'answer'
}

// ── 主运行器（AsyncGenerator，实时推送 AgentEvent）──────────────────

export interface AgentRunConfig {
  baseUrl: string
  apiKey: string
  model: string
  signal?: AbortSignal
}

export async function* runAgent(
  userMessage: string,
  history: LlmMessage[],
  ctx: ToolContext,
  config: AgentRunConfig,
): AsyncGenerator<AgentEvent, AgentState, undefined> {
  const systemPrompt = buildSystemPrompt(ctx)

  // 初始化状态（对应 GraphState 初始化）
  const state: AgentState = {
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ],
    iterations: 0,
    done: false,
  }

  while (!state.done && state.iterations < MAX_ITERATIONS) {
    // ── generate_node ──
    let llmResponse
    try {
      llmResponse = await generateNode(state, config)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      yield { type: 'error', label: '调用模型失败', content: msg }
      state.error = msg
      state.done = true
      break
    }

    const { message, finish_reason } = llmResponse
    state.messages.push(message)

    const next = decideNextStep(finish_reason, state.iterations)

    if (next === 'continue' && message.tool_calls?.length) {
      // ── execute_node ──
      const execResults = executeNode(message.tool_calls, ctx)

      for (const { toolCall, result } of execResults) {
        // 推送 tool_call 事件
        yield {
          type: 'tool_call',
          label: `调用工具：${toolCall.function.name}`,
          content: toolCall.function.arguments,
          toolName: toolCall.function.name,
        }

        // 推送 tool_result 事件
        yield {
          type: 'tool_result',
          label: result.success ? '执行成功' : '执行失败',
          content: result.display,
          toolName: toolCall.function.name,
        }

        // 将工具结果追加到消息历史
        state.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: result.output,
        })
      }

      state.iterations++

    } else if (next === 'answer') {
      // LLM 给出最终文本回答，用流式推送 token
      const finalContent = message.content ?? ''
      if (finalContent) {
        yield { type: 'answer', label: '回答', content: finalContent }
      }
      state.done = true

    } else {
      // max iterations 达到
      yield {
        type: 'answer',
        label: '已达最大迭代次数',
        content: message.content ?? '（已达最大迭代轮数，任务可能未完成）',
      }
      state.done = true
    }
  }

  yield { type: 'done', label: '完成', content: '' }
  return state
}

/**
 * 将 AgentEvent 序列转换为流式 token 文本（供兼容现有 streaming UI 的场景使用）。
 * 最终回答内容逐 token 推送，工具调用步骤作为 Markdown 格式插入。
 */
export async function runAgentToStream(
  userMessage: string,
  history: LlmMessage[],
  ctx: ToolContext,
  config: AgentRunConfig,
  callbacks: {
    onStep: (event: AgentEvent) => void
    onToken: (token: string) => void
    onDone: () => void
    onError: (msg: string) => void
  },
): Promise<void> {
  const { onStep, onToken, onDone, onError } = callbacks

  try {
    const gen = runAgent(userMessage, history, ctx, config)
    for await (const event of gen) {
      if (event.type === 'error') {
        onError(event.content)
        return
      }
      if (event.type === 'tool_call' || event.type === 'tool_result') {
        onStep(event)
      }
      if (event.type === 'answer') {
        // 模拟逐 token 推送（content 已经是完整字符串）
        onToken(event.content)
      }
    }
    onDone()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('AbortError') || msg.includes('abort')) return
    onError(msg)
  }
}
