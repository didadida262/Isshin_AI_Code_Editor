"""
LangGraph StateGraph 主循环
对应 my_codegen_agent/main.py 的完整移植与扩展。

控制流（与原版一致）：
    generate_node  ←──────────────────┐
         │                            │  (has tool_calls && iterations < MAX)
         ▼                            │
    execute_node                      │
         │                            │
         ▼                            │
    _route() ─────────────────────────┘
         │
         ▼ (no tool_calls 或 iterations >= MAX)
        END

扩展：工具为文件读写（非 Python exec），实现编辑器代码修改。
"""

from __future__ import annotations

import config as cfg
from langchain_core.messages import AIMessage
from langgraph.graph import END, StateGraph

from .nodes import make_nodes
from .schema import AgentGraphState
from .tools import FileStore


def build_graph(
    model_name: str,
    base_url: str,
    api_key: str,
    store: FileStore,
    active_file: str | None = None,
    on_token=None,
):
    """
    构建并编译 LangGraph StateGraph。
    on_token: 可选回调，用于将 LLM 文本 token 实时推送到 SSE 层。
    """
    generate_node, execute_node = make_nodes(
        model_name, base_url, api_key, store, active_file, on_token=on_token
    )

    # ── 路由函数（对应 decide_next_step）──────────────────────────────

    def _route(state: AgentGraphState) -> str:
        """
        决定下一步：
        - 有 tool_calls 且未超限 → execute（继续循环）
        - 无 tool_calls 或超限    → end（结束）
        """
        last = state["messages"][-1]
        if (
            isinstance(last, AIMessage)
            and last.tool_calls
            and state["iterations"] < cfg.MAX_ITERATIONS
        ):
            return "execute"
        return "end"

    # ── 构建图 ────────────────────────────────────────────────────────

    graph = StateGraph(AgentGraphState)
    graph.add_node("generate", generate_node)
    graph.add_node("execute", execute_node)

    graph.set_entry_point("generate")
    graph.add_conditional_edges(
        "generate",
        _route,
        {"execute": "execute", "end": END},
    )
    graph.add_edge("execute", "generate")

    return graph.compile()
