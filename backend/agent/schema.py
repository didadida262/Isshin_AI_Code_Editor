"""
Agent 数据模型
对应 my_codegen_agent/schema.py 的扩展移植版本。

GraphState 基于 LangGraph 的 Annotated add_messages 模式，
比原版 Pydantic GraphState 更符合 LangGraph 惯用法。
"""

from __future__ import annotations

from typing import Annotated, Dict, List, Optional
from typing_extensions import TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel


class AgentGraphState(TypedDict):
    """LangGraph 全局共享状态（对应 my_codegen_agent 中的 GraphState）。"""

    # 完整对话消息列表，LangGraph 的 add_messages reducer 自动处理合并
    messages: Annotated[List[BaseMessage], add_messages]
    # 当前已迭代的工具调用轮数（对应 iterations）
    iterations: int


# ── HTTP 请求 / 响应模型 ──────────────────────────────────────────────

class AgentRequest(BaseModel):
    """前端发送给 /agent/stream 的请求体。"""

    user_message: str
    # 对话历史（只含 user / assistant 角色，role + content）
    history: List[Dict[str, str]] = []
    # 编辑器中当前所有 tab 的内容 {path: content}
    files: Dict[str, str] = {}
    # 当前激活文件路径
    active_file: Optional[str] = None
    # LLM 配置（前端传入优先；留空时自动使用 config.py 默认值）
    model: str = ""
    base_url: str = ""   # 如 https://aiplatform.njsrd.com/llm/v1
    api_key: str = ""
