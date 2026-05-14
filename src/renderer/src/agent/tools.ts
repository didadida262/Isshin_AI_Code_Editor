/**
 * 工具定义（JSON Schema）+ 工具执行器
 * 对应 my_codegen_agent/nodes.py 中 execute_code_node 的工具化版本。
 *
 * 工具列表：
 *   - list_files   → 列出编辑器中所有可用文件
 *   - read_file    → 读取指定文件内容
 *   - write_file   → 写入 / 覆盖文件，同步更新编辑器 tab
 */

import type { ToolDefinition, ToolContext, LlmToolCall } from './types'

// ── 工具 JSON Schema 定义（发送给 LLM）────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        '列出编辑器中当前所有可用文件的路径列表。在读取或修改文件之前，先调用此工具了解文件结构。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定路径文件的完整内容。修改文件前务必先读取，确保了解现有代码结构。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径，如 "src/renderer/src/App.tsx"',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        '写入或覆盖指定路径的文件。必须提供完整的文件内容（非 diff），写入后会自动同步到编辑器。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径',
          },
          content: {
            type: 'string',
            description: '文件的完整新内容（不要包含 markdown 代码块标记）',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
]

// ── 工具执行器 ───────────────────────────────────────────────────────

export interface ToolExecutionResult {
  success: boolean
  output: string
  /** 格式化后的展示文字（用于 UI）*/
  display: string
}

export function executeToolCall(
  toolCall: LlmToolCall,
  ctx: ToolContext,
): ToolExecutionResult {
  const { name, arguments: argsJson } = toolCall.function

  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    const err = `工具参数 JSON 解析失败: ${argsJson}`
    return { success: false, output: JSON.stringify({ error: err }), display: err }
  }

  try {
    switch (name) {
      case 'list_files': {
        const files = ctx.listFiles()
        const output = JSON.stringify({ files, count: files.length })
        const display = files.length > 0
          ? `已列出 ${files.length} 个文件:\n${files.join('\n')}`
          : '编辑器中暂无打开的文件'
        return { success: true, output, display }
      }

      case 'read_file': {
        const path = String(args.path ?? '').trim()
        if (!path) {
          return {
            success: false,
            output: JSON.stringify({ error: 'path 参数不能为空' }),
            display: '错误：缺少 path 参数',
          }
        }
        const content = ctx.readFile(path)
        if (content === null) {
          const msg = `文件不存在: ${path}`
          return { success: false, output: JSON.stringify({ error: msg }), display: msg }
        }
        const lines = content.split('\n').length
        return {
          success: true,
          output: JSON.stringify({ path, content }),
          display: `已读取 ${path}（${lines} 行）`,
        }
      }

      case 'write_file': {
        const path = String(args.path ?? '').trim()
        const content = String(args.content ?? '')
        if (!path) {
          return {
            success: false,
            output: JSON.stringify({ error: 'path 参数不能为空' }),
            display: '错误：缺少 path 参数',
          }
        }
        ctx.writeFile(path, content)
        const lines = content.split('\n').length
        return {
          success: true,
          output: JSON.stringify({ success: true, path, lines }),
          display: `已写入 ${path}（${lines} 行）`,
        }
      }

      default:
        return {
          success: false,
          output: JSON.stringify({ error: `未知工具: ${name}` }),
          display: `错误：未知工具 "${name}"`,
        }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      success: false,
      output: JSON.stringify({ error: msg }),
      display: `执行出错: ${msg}`,
    }
  }
}
