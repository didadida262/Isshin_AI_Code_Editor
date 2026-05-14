"""
ISShin Code — Agent 后端服务
FastAPI + LangGraph，以 Tauri sidecar 或独立进程运行于 127.0.0.1:8788。

端点：
  GET  /health         —— 健康检查
  POST /agent/stream   —— SSE 流式执行 LangGraph agent

SSE 事件格式：
  event: tool_call     data: {"tool":"read_file","display":"调用工具: read_file","args":{...}}
  event: tool_result   data: {"tool":"read_file","display":"已读取 App.tsx（120 行）"}
  event: write_file    data: {"path":"src/App.tsx","content":"...完整内容..."}
  event: token         data: {"content":"代码已修改..."}
  event: done          data: {}
  event: error         data: {"message":"..."}
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent.graph import build_graph
from agent.schema import AgentGraphState, AgentRequest
from agent.tools import FileStore

# ── App ──────────────────────────────────────────────────────────────

app = FastAPI(title="ISShin Code Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # Tauri webview 在不同平台的 origin 格式不一
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "https://tauri.localhost",
        "http://tauri.localhost",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

AGENT_PORT = int(os.environ.get("AGENT_PORT", "8788"))


# ── SSE 工具函数 ──────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """格式化单条 SSE 消息。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── 端点 ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "ISShin Code Agent"}


@app.post("/agent/stream")
async def agent_stream(req: AgentRequest):
    """
    执行 LangGraph agent 并以 SSE 流式返回中间步骤和最终回答。

    流程：
      1. 初始化内存文件仓库（FileStore）
      2. 在线程池中运行 LangGraph graph.stream()
      3. 每步输出解析为 SSE 事件推入 asyncio.Queue
      4. 异步生成器从 Queue 消费并 yield SSE 字符串
    """

    async def generate() -> AsyncIterator[str]:
        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        loop = asyncio.get_event_loop()

        # ── 初始化文件仓库和图 ───────────────────────────────────────
        store = FileStore(req.files)

        graph = build_graph(
            model_name=req.model,
            base_url=req.base_url,
            api_key=req.api_key,
            store=store,
            active_file=req.active_file,
        )

        # ── 构建初始消息列表 ─────────────────────────────────────────
        history_messages = []
        for h in req.history:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role == "user":
                history_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                from langchain_core.messages import AIMessage as AI
                history_messages.append(AI(content=content))

        initial_state: AgentGraphState = {
            "messages": history_messages + [HumanMessage(content=req.user_message)],
            "iterations": 0,
        }

        # ── 在线程池中运行 LangGraph（同步 API）─────────────────────

        def run_graph() -> None:
            """
            遍历 graph.stream() 的每步输出，解析事件并推入 queue。
            对应 my_codegen_agent/main.py 中 app.invoke() 的异步化版本。
            """
            try:
                for step in graph.stream(initial_state, stream_mode="updates"):
                    for node_name, node_output in step.items():
                        messages = node_output.get("messages", [])

                        if node_name == "generate":
                            for msg in messages:
                                if not isinstance(msg, AIMessage):
                                    continue

                                if msg.tool_calls:
                                    # 推送每个 tool_call 事件
                                    for tc in msg.tool_calls:
                                        loop.call_soon_threadsafe(
                                            queue.put_nowait,
                                            (
                                                "tool_call",
                                                {
                                                    "tool": tc["name"],
                                                    "display": f"调用工具: {tc['name']}",
                                                    "args": tc.get("args", {}),
                                                },
                                            ),
                                        )
                                elif msg.content:
                                    # 最终回答（无 tool_calls）
                                    loop.call_soon_threadsafe(
                                        queue.put_nowait,
                                        ("token", {"content": msg.content}),
                                    )

                        elif node_name == "execute":
                            for msg in messages:
                                if not isinstance(msg, ToolMessage):
                                    continue

                                tool_name = getattr(msg, "name", "")
                                content_str = msg.content or ""

                                loop.call_soon_threadsafe(
                                    queue.put_nowait,
                                    (
                                        "tool_result",
                                        {"tool": tool_name, "display": content_str[:200]},
                                    ),
                                )

                            # 消费 FileStore 中的写入记录，推送 write_file 事件
                            for write_op in store.pop_writes():
                                loop.call_soon_threadsafe(
                                    queue.put_nowait,
                                    ("write_file", write_op),
                                )

            except Exception as exc:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    ("error", {"message": str(exc)}),
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        asyncio.get_event_loop().run_in_executor(None, run_graph)

        # ── 消费 queue，yield SSE 事件 ────────────────────────────────
        while True:
            item = await queue.get()
            if item is None:
                yield _sse("done", {})
                break
            event_type, data = item
            yield _sse(event_type, data)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── 入口（开发模式直接运行） ────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=AGENT_PORT,
        reload=False,
        log_level="info",
    )
