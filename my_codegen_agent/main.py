from langgraph.graph import StateGraph, END
from schema import GraphState
from nodes import generate_code_node, execute_code_node
import config

# 条件路由决策函数
def decide_next_step(state: GraphState):
    if state.error_message is None:
        print(f"\n[+] 成功：代码在第 {state.iterations} 轮尝试中运行成功！")
        return "end"
    
    if state.iterations >= config.MAX_ITERATIONS:
        print(f"\n[-] 失败：已达到最大重试次数 {config.MAX_ITERATIONS}，纠错失败。")
        return "end"
        
    print(f"[-] 错误：代码运行失败，准备进入第 {state.iterations + 1} 轮自我纠错...")
    return "generate"

# 1. 构建图结构并注册节点
workflow = StateGraph(GraphState)
workflow.add_node("generate_code", generate_code_node)
workflow.add_node("execute_code", execute_code_node)

# 2. 设置连线关系
workflow.set_entry_point("generate_code")
workflow.add_edge("generate_code", "execute_code")
workflow.add_conditional_edges(
    "execute_code",
    decide_next_step,
    {
        "generate": "generate_code",
        "end": END
    }
)

# 3. 编译应用
app = workflow.compile()

# 4. 运行测试
if __name__ == "__main__":
    # 设定一个容易触发边界错误的复杂需求
    test_requirement = (
        "写一个函数 `parse_and_sum(json_str)`，接收一个嵌套的 JSON 字符串，"
        "提取出里面所有的数字并求和。注意：数字可能以字符串形式存在（如 '123'），"
        "部分 key 可能缺失，必须处理好类型转换和异常，不能崩溃。"
    )
    
    print("导入任务，开始执行 Agent...")
    initial_state = {"requirement": test_requirement}
    
    # 启动状态机
    final_result = app.invoke(initial_state)
    
    print("\n================ 最终交付结果 ================")
    print(f"最终生成的代码：\n{final_result.get('current_code')}")