# Isshin AI Code Editor

基于 **Tauri + React + Python** 构建的桌面 AI 代码编辑器。内嵌 Monaco 编辑器，集成 LangGraph 驱动的 AI Agent，可自主读写编辑器中的文件，支持 SSE 流式对话。

## 功能特性

- **代码编辑器**：Monaco Editor，支持多 Tab、语法高亮、文件资源管理器
- **AI 聊天侧栏**：流式输出，Markdown 渲染，支持多轮对话上下文
- **Agent 模式**：AI 自主调用工具读取 / 修改文件，实时显示工具调用过程
- **集成终端**：基于 xterm.js 的内嵌终端面板
- **工作区搜索**：文件名 / 文件内容全文搜索（Rust 实现，上限 500 条）
- **主题切换**：暗色 / 亮色主题，全局 ThemeProvider 管理
- **可配置模型**：在设置面板中填写 Base URL、API Key、Model，无需改代码

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript + Tailwind CSS + Vite + Framer Motion |
| AI Agent 后端 | Python FastAPI + LangGraph |
| LLM 代理网关 | Rust Axum（内嵌于 Tauri，端口 8787） |
| 图标库 | Font Awesome |

## 目录结构

```
├── src/renderer/          # React 前端（Vite + TypeScript + Tailwind）
│   └── src/
│       ├── components/    # UI 组件（编辑器、聊天侧栏、终端、搜索等）
│       ├── agent/         # 前端 Agent 运行时（SSE 消费、工具结果处理）
│       ├── api/           # HTTP 客户端封装
│       └── providers/     # ThemeProvider
├── src-tauri/             # Tauri 壳（Rust）
│   └── src/
│       ├── commands.rs    # Tauri 命令（文件读写、目录树、工作区搜索）
│       ├── proxy.rs       # LLM API 反向代理（Axum，:8787）
│       └── terminal.rs    # 终端进程管理
└── backend/               # Python Agent 后端（FastAPI + LangGraph，:8788）
    ├── main.py            # FastAPI 入口，/agent/stream SSE 端点
    └── agent/
        ├── graph.py       # LangGraph StateGraph 主循环
        ├── nodes.py       # generate / execute 节点
        ├── tools.py       # 文件读写工具（FileStore）
        └── schema.py      # 状态机类型定义
```

## 运行时端口

| 服务 | 地址 | 说明 |
|------|------|------|
| Vite 开发服务器 | `http://127.0.0.1:5173` | 开发时由 Tauri 自动启动 |
| Rust Axum 网关 | `http://127.0.0.1:8787` | 随 Tauri 启动，代理 LLM API |
| Python Agent 后端 | `http://127.0.0.1:8788` | **需手动启动** |
| LLM API | 可配置 | 默认 `https://aiplatform.njsrd.com` |

## 环境准备

| 工具 | 版本要求 |
|------|----------|
| Node.js | ≥ 18 |
| Rust | stable |
| Python | ≥ 3.10 |
| Xcode CLT（macOS） | 最新 |

```bash
node -v    # ≥ 18
rustc -V   # stable
python3 -V # ≥ 3.10
```

## 本地开发

### 1. 安装依赖

```bash
# 前端依赖
npm install

# Python 后端依赖（建议使用虚拟环境）
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip3 install -r requirements.txt
cd ..
```

### 2. 启动开发环境

需要两个终端并行运行：

**终端 1 — Python Agent 后端**

```bash
npm run dev:agent
# 等价于：cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8788 --reload
```

启动成功后输出：
```
INFO:     Uvicorn running on http://127.0.0.1:8788 (Press CTRL+C to quit)
```

**终端 2 — Tauri 桌面应用**

```bash
npm run dev
```

Tauri 会自动启动 Vite 开发服务器、编译 Rust 网关（首次约 1-3 分钟）并打开桌面窗口。

### 3. 配置 LLM

在应用右上角设置面板中填写：

- **Base URL**：`https://aiplatform.njsrd.com`
- **API Key**：Bearer Token
- **Model**：`qwen3.5-122b-a10b`（或其他兼容 OpenAI 格式的模型）

### 4. 使用 Agent 模式

1. 在 AI 聊天侧栏右上角点击 **⚡ Agent** 按钮（亮绿色代表已开启）
2. 打开一个工作区文件夹，在编辑器中打开文件
3. 发送指令，例如：
   - `"帮我把 App.tsx 里的标题改成 Hello World"`
   - `"新建一个 utils.ts 文件，导出一个 formatDate 函数"`
4. Agent 会自动读取文件 → 修改 → 写回编辑器 Tab

## 打包桌面端

### 1. 打包 Python 后端为可执行文件

```bash
cd backend
pip3 install pyinstaller
pyinstaller --onefile main.py -n agent-server
```

### 2. 将可执行文件放入 Tauri binaries 目录

```bash
mkdir -p src-tauri/binaries

# macOS Apple Silicon
cp backend/dist/agent-server src-tauri/binaries/agent-server-aarch64-apple-darwin

# macOS Intel
# cp backend/dist/agent-server src-tauri/binaries/agent-server-x86_64-apple-darwin

# Windows（需在 Windows 环境下打包）
# cp backend/dist/agent-server.exe src-tauri/binaries/agent-server-x86_64-pc-windows-msvc.exe
```

### 3. 在 tauri.conf.json 中注册 sidecar

```json
"bundle": {
  "externalBin": ["binaries/agent-server"]
}
```

### 4. 构建安装包

```bash
npm run build:tauri
```

产物位于 `src-tauri/target/release/bundle/`：
- macOS：`dmg/Isshin AI Code Editor_1.0.0_aarch64.dmg`
- Windows：`nsis/Isshin AI Code Editor_1.0.0_x64-setup.exe`

## 脚本摘要

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Tauri + Vite 开发环境 |
| `npm run dev:web` | 仅启动 Vite（不含 Tauri 壳） |
| `npm run dev:agent` | 启动 Python Agent 后端（:8788） |
| `npm run agent:install` | 安装 Python 后端依赖（pip3） |
| `npm run build:tauri` | 构建并打包桌面安装包 |
| `npm run lint` | ESLint 检查 |

## 常见问题

**Rust 首次编译很慢**

首次 `npm run dev` 编译 Rust 依赖约需 1-3 分钟，后续增量编译通常在 10 秒内。

**Agent 模式报错 `ERR_CONNECTION_REFUSED`**

Python 后端未启动。请先在另一个终端执行 `npm run dev:agent`，确认监听 `:8788` 后再使用 Agent 功能。

**打包时报 `resource path 'binaries/agent-server-...' doesn't exist`**

开发阶段不需要 sidecar，保持 `tauri.conf.json` 中无 `externalBin` 字段即可；仅在正式打包前按上述步骤添加。
