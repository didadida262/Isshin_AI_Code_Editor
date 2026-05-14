# 这里存放所有数据结构的定义。注意：要导入 config 模块。
from pydantic import BaseModel, Field
from typing import Optional

# 1. 强制 LLM 返回的严格 JSON 结构
class AgentCodeResponse(BaseModel):
    thought: str = Field(description="你对当前代码需求或上一次报错信息的深入思考与分析")
    code: str = Field(description="完整的、可直接运行的 Python 代码，不要包含任何 markdown 标记（如 ```python）")

# 2. LangGraph 状态机全局共享的状态 (State)
class GraphState(BaseModel):
    requirement: str                 # 用户的原始需求
    current_code: Optional[str] = None   # 当前生成的代码
    error_message: Optional[str] = None  # 编译器的报错信息（如果有）
    iterations: int = 0              # 当前已循环重试的次数