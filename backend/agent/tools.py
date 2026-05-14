"""
文件操作工具定义
对应 my_codegen_agent/nodes.py 中 execute_code_node 的工具化版本。

工具列表：
  list_files  —— 列出内存文件库中所有可用文件
  read_file   —— 读取指定文件内容
  write_file  —— 写入 / 覆盖文件，同时记录到 _writes 列表供 SSE 推送

设计说明：
  FileStore 是可变的内存文件字典，由请求体 files 初始化。
  write_file 会在 _writes 中追加写入记录，SSE 事件生成器
  在每轮 execute 节点结束后消费这些记录，推送 write_file 事件给前端。
"""

from __future__ import annotations

from typing import Dict, List
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool


class FileStore:
    """内存文件仓库，追踪写入操作供 SSE 事件推送。"""

    def __init__(self, files: Dict[str, str]) -> None:
        self._store: Dict[str, str] = dict(files)
        self._writes: List[Dict[str, str]] = []

    # ── 工具函数 ──────────────────────────────────────────────────────

    def list_files(self) -> str:
        paths = list(self._store.keys())
        if not paths:
            return "编辑器中没有打开的文件。"
        return "可用文件列表：\n" + "\n".join(f"  - {p}" for p in paths)

    def read_file(self, path: str) -> str:
        if path not in self._store:
            return f"错误：文件不存在 — {path}"
        content = self._store[path]
        lines = len(content.splitlines())
        return f"# 文件路径: {path}\n# 行数: {lines}\n\n{content}"

    def write_file(self, path: str, content: str) -> str:
        self._store[path] = content
        lines = len(content.splitlines())
        self._writes.append({"path": path, "content": content})
        return f"已成功写入 {path}（{lines} 行）"

    # ── 辅助方法 ──────────────────────────────────────────────────────

    def pop_writes(self) -> List[Dict[str, str]]:
        """消费并清空已记录的写入操作列表。"""
        result = self._writes[:]
        self._writes.clear()
        return result


# ── Pydantic 参数模型 ─────────────────────────────────────────────────

class _ReadFileArgs(BaseModel):
    path: str = Field(description="要读取的文件路径，如 src/renderer/src/App.tsx")


class _WriteFileArgs(BaseModel):
    path: str = Field(description="要写入的文件路径")
    content: str = Field(description="文件的完整新内容（非 diff，不要包含 markdown 代码块标记）")


# ── 工具工厂 ──────────────────────────────────────────────────────────

def make_tools(store: FileStore) -> list:
    """根据 FileStore 实例创建绑定了闭包的 StructuredTool 列表。"""

    list_files_tool = StructuredTool.from_function(
        func=store.list_files,
        name="list_files",
        description="列出编辑器中当前所有可用文件的路径列表。在读写文件前先调用此工具。",
    )

    read_file_tool = StructuredTool.from_function(
        func=store.read_file,
        name="read_file",
        description="读取指定路径文件的完整内容。修改文件前必须先读取，确保了解现有结构。",
        args_schema=_ReadFileArgs,
    )

    write_file_tool = StructuredTool.from_function(
        func=store.write_file,
        name="write_file",
        description=(
            "写入或覆盖指定路径的文件。必须提供完整内容（不能只写部分代码），"
            "写入后会自动同步到编辑器。"
        ),
        args_schema=_WriteFileArgs,
    )

    return [list_files_tool, read_file_tool, write_file_tool]
