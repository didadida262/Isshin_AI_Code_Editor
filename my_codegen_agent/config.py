# 先把环境变量和公共配置抽离出来，方便后续修改。
import os

# 1. 填入你提供的真实 API Key
os.environ["OPENAI_API_KEY"] = "sk-NzoFiZU0ZFmoXj30s4x7rQfhgY2XSacxWI0i0BwE"

# 2. 填入你给出的专属调用地址
os.environ["OPENAI_API_BASE"] = "https://aiplatform.njsrd.com/llm/v1" 

# 3. 指定你的 Qwen 专属模型名称
MODEL_NAME = "qwen3.5-122b-a10b"

# 最大重试轮数，防止 Agent 陷入死循环
MAX_ITERATIONS = 5