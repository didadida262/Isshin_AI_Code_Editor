"""
后端默认配置
对应 my_codegen_agent/config.py 的移植版本。

前端传入的 base_url / api_key / model 优先级更高；
若前端未填写，自动回退到此处的默认值。
"""

import os

# ── LLM API ──────────────────────────────────────────────────────────

API_KEY: str = os.environ.get("OPENAI_API_KEY", "")

# 形如 https://aiplatform.njsrd.com 或 https://aiplatform.njsrd.com/llm/v1
BASE_URL: str = os.environ.get(
    "OPENAI_API_BASE",
    "https://aiplatform.njsrd.com/llm/v1",
)

MODEL_NAME: str = os.environ.get("MODEL_NAME", "qwen3.5-122b-a10b")

# ── Agent ────────────────────────────────────────────────────────────

MAX_ITERATIONS: int = int(os.environ.get("MAX_ITERATIONS", "5"))

# ── Server ───────────────────────────────────────────────────────────

AGENT_PORT: int = int(os.environ.get("AGENT_PORT", "8788"))
