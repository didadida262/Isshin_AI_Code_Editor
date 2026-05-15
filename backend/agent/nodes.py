"""
Agent 节点定义
对应 my_codegen_agent/nodes.py 的扩展移植版本。

节点列表：
  generate_node —— 调用 LLM（含工具绑定），返回 AIMessage（可能含 tool_calls）
  execute_node  —— 执行 AIMessage 中的所有 tool_calls，返回 ToolMessage 列表

System Prompt 指导 LLM 先读取文件，再进行最小化精准修改，最后确认完成。
"""

from __future__ import annotations

import os
from typing import List

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

import config as cfg
from .schema import AgentGraphState
from .tools import FileStore, make_tools


def _build_system_prompt(store: FileStore, active_file: str | None, model_name: str) -> str:
    """构建包含编辑器上下文的 System Prompt。"""
    files = store.list_files()
    active_hint = f"\n当前激活文件：{active_file}" if active_file else ""

    identity_hint = (
        f"\n\n【模型名称答复】本次 API 请求的 model 标识为「{model_name}」。"
        "若用户问你是什么模型、名称或版本，应据此回答（例如你是通过该标识接入的助手）。"
        "不要自称与上述标识不符的其它模型名称。"
    )

    return f"""你是 Isshin AI Code Editor，一个专业的代码助手，直接集成在代码编辑器中。

你可以使用以下工具来读取和修改编辑器中的文件：
- list_files：列出所有可用文件
- read_file：读取指定文件的完整内容
- write_file：写入/覆盖文件（必须提供完整内容）

工作原则：
1. 修改文件前，先用 read_file 读取现有内容，充分理解代码结构
2. 使用 write_file 时，必须提供完整的文件内容，不能只写部分代码
3. 每次操作前先思考，再行动
4. 优先进行最小化、精准的修改
5. 完成后简洁说明做了什么改动

{files}{active_hint}{identity_hint}"""


def make_nodes(
    model_name: str,
    base_url: str,
    api_key: str,
    store: FileStore,
    active_file: str | None = None,
    on_token=None,
):
    """
    创建 generate_node 和 execute_node 的工厂函数。
    返回 (generate_node, execute_node) 元组。
    on_token: 可选回调，接收每个文本 token 字符串，用于 SSE 实时推流。
    """
    tools = make_tools(store)
    tool_map = {t.name: t for t in tools}

    # LLM 直接调用上游 API（不经过 Rust 网关，避免循环）
    _base = base_url.rstrip("/")
    # 规范化为 {origin}/llm/v1
    if not _base.endswith("/llm/v1"):
        _base = f"{_base}/llm/v1"

    llm = ChatOpenAI(
        model=model_name,
        base_url=_base,
        api_key=api_key,
        streaming=True,
    ).bind_tools(tools)

    system_msg = SystemMessage(content=_build_system_prompt(store, active_file, model_name))

    # ── Node 1: generate_node ──────────────────────────────────────────

    def generate_node(state: AgentGraphState) -> dict:
        """
        调用 LLM 并逐 token 流式推送文本内容。
        工具调用（tool_calls）时不推送 token，仅在纯文本回答时流式输出。
        """
        messages = [system_msg] + list(state["messages"])

        accumulated = None
        is_tool_call_mode = False

        for chunk in llm.stream(messages):
            # 一旦出现 tool_call_chunks 说明本次是工具调用，停止推送文本 token
            if getattr(chunk, "tool_call_chunks", None):
                is_tool_call_mode = True

            if not is_tool_call_mode and chunk.content and on_token:
                on_token(chunk.content)

            accumulated = chunk if accumulated is None else accumulated + chunk

        # 将累积的 AIMessageChunk 转换为完整 AIMessage
        if accumulated is None:
            response = AIMessage(content="")
        else:
            response = AIMessage(
                content=accumulated.content or "",
                tool_calls=list(accumulated.tool_calls) if accumulated.tool_calls else [],
            )

        return {
            "messages": [response],
            "iterations": state.get("iterations", 0),
        }

    # ── Node 2: execute_node ───────────────────────────────────────────

    def execute_node(state: AgentGraphState) -> dict:
        """
        执行 AIMessage 中的所有工具调用，收集 ToolMessage。
        对应 my_codegen_agent/nodes.py 中的 execute_code_node。
        """
        last: AIMessage = state["messages"][-1]
        tool_messages: List[ToolMessage] = []

        for tc in last.tool_calls:
            name = tc["name"]
            args = tc["args"]
            tool_call_id = tc["id"]

            if name in tool_map:
                try:
                    result = tool_map[name].invoke(args)
                except Exception as exc:
                    result = f"工具执行出错: {exc}"
            else:
                result = f"未知工具: {name}"

            tool_messages.append(
                ToolMessage(content=result, tool_call_id=tool_call_id, name=name)
            )

        return {
            "messages": tool_messages,
            "iterations": state["iterations"] + 1,
        }

    return generate_node, execute_node
