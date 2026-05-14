import sys
import io
import traceback
from langchain_openai import ChatOpenAI
from schema import AgentCodeResponse, GraphState
import config

# 实例化大模型
model = ChatOpenAI(model=config.MODEL_NAME).with_structured_output(AgentCodeResponse)

# 节点一：代码生成与修正
def generate_code_node(state: GraphState) -> dict:
    if state.error_message:
        prompt = f"你上一次编写的代码报错了。\n【错误信息】:\n{state.error_message}\n\n请结合你的思考（Thought）并彻底修复这个错误，重新输出完整可运行的代码。"
    else:
        prompt = f"请根据以下需求编写 Python 代码：\n{state.requirement}"
        
    response = model.invoke(prompt)
    return {
        "current_code": response.code,
        "iterations": state.iterations
    }

# 节点二：代码本地动态执行
def execute_code_node(state: GraphState) -> dict:
    code = state.current_code
    old_stdout = sys.stdout
    redirected_output = sys.stdout = io.StringIO()
    
    error_info = None
    try:
        # 动态执行 Agent 编写的代码
        exec_globals = {}
        exec(code, exec_globals)
    except Exception as e:
        error_info = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
        
    return {
        "error_message": error_info,
        "iterations": state.iterations + 1  # 每次执行完，重试次数加 1
    }