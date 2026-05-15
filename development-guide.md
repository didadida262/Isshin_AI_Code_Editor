# Isshin AI Code Editor — 开发与打包指南

## 目录

1. [项目架构](#项目架构)
2. [环境准备](#环境准备)
3. [本地开发](#本地开发)
4. [打包桌面端](#打包桌面端)
5. [常见问题](#常见问题)

---

## 项目架构

```
project_RAG/
├── src/renderer/          # React 前端（Vite + TypeScript + Tailwind）
├── src-tauri/             # Tauri 壳（Rust，内嵌 Axum 反向代理网关 :8787）
├── backend/               # Python Agent 后端（FastAPI + LangGraph，运行于 :8788）
│   ├── main.py            # FastAPI 入口，/agent/stream SSE 端点
│   ├── agent/
│   │   ├── schema.py      # 状态机类型定义
│   │   ├── tools.py       # 文件读写工具（FileStore）
│   │   ├── nodes.py       # LangGraph 节点（generate / execute）
│   │   └── graph.py       # StateGraph 主循环
│   └── requirements.txt
└── my_codegen_agent/      # 原始 Python agent 参考实现（仅作参考，不运行）
```

### 运行时端口分布

| 服务 | 地址 | 说明 |
|------|------|------|
| Vite 前端开发服务器 | `http://127.0.0.1:5173` | 开发时由 Tauri 自动启动 |
| Rust Axum 网关 | `http://127.0.0.1:8787` | 随 Tauri 启动，代理 LLM API 请求 |
| Python Agent 后端 | `http://127.0.0.1:8788` | **需手动启动**（开发阶段） |
| LLM API | `https://aiplatform.njsrd.com` | 外部服务，由 Rust 网关转发 |

---

## 环境准备

### 基础依赖

| 工具 | 版本要求 | 安装方式 |
|------|----------|----------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Python | ≥ 3.10 | [python.org](https://python.org)（macOS 用 `brew install python3`）|
| Xcode CLT（macOS） | 最新 | `xcode-select --install` |

### 检查环境

```bash
node -v       # ≥ 18
rustc -V      # stable
python3 -V    # ≥ 3.10
pip3 -V
```

---

## 本地开发

### 第一步：安装前端依赖

```bash
npm install
```

### 第二步：安装 Python 后端依赖

```bash
npm run agent:install
# 等价于：cd backend && pip3 install -r requirements.txt
```

> **建议使用虚拟环境：**
> ```bash
> cd backend
> python3 -m venv .venv
> source .venv/bin/activate   # Windows: .venv\Scripts\activate
> pip3 install -r requirements.txt
> ```

### 第三步：启动开发环境（需两个终端）

**终端 1 — Python Agent 后端**

```bash
npm run dev:agent
# 等价于：cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8788 --reload
```

启动成功后终端输出：
```
INFO:     Uvicorn running on http://127.0.0.1:8788 (Press CTRL+C to quit)
```

**终端 2 — Tauri 前端应用**

```bash
npm run dev
```

Tauri 会自动：
1. 启动 Vite 开发服务器（:5173）
2. 编译 Rust 网关（首次较慢，约 1-2 分钟）
3. 打开桌面窗口

### 使用 Agent 模式

1. 在 AI 聊天侧栏点击右上角 **⚡ Agent** 按钮（亮绿色代表已开启）
2. 在输入框发送指令，例如：
   - `"帮我把 App.tsx 里的标题改成 Hello World"`
   - `"在编辑器里新建一个 utils.ts 文件，导出一个 formatDate 函数"`
3. Agent 会自动读取文件 → 修改 → 写回编辑器 tab

---

## 打包桌面端

### 第一步：打包 Python 后端为可执行文件

```bash
cd backend

# 安装 PyInstaller
pip3 install pyinstaller

# 打包为单文件（macOS Apple Silicon 示例）
pyinstaller --onefile main.py -n agent-server
```

打包完成后文件位于 `backend/dist/agent-server`。

### 第二步：将可执行文件放入 Tauri binaries 目录

Tauri 要求二进制文件名包含目标平台的 triple 后缀：

```bash
mkdir -p src-tauri/binaries

# macOS Apple Silicon (M1/M2/M3)
cp backend/dist/agent-server src-tauri/binaries/agent-server-aarch64-apple-darwin

# macOS Intel
# cp backend/dist/agent-server src-tauri/binaries/agent-server-x86_64-apple-darwin

# Windows (需在 Windows 环境下打包)
# cp backend/dist/agent-server.exe src-tauri/binaries/agent-server-x86_64-pc-windows-msvc.exe
```

### 第三步：在 tauri.conf.json 中注册 sidecar

编辑 `src-tauri/tauri.conf.json`，在 `bundle` 字段中添加：

```json
"bundle": {
  "externalBin": ["binaries/agent-server"],
  ...
}
```

### 第四步：打包 Tauri 应用

```bash
npm run build:tauri
```

产物位于 `src-tauri/target/release/bundle/`：
- macOS：`dmg/Isshin AI Code Editor_1.0.0_aarch64.dmg`
- Windows：`nsis/Isshin AI Code Editor_1.0.0_x64-setup.exe`

---

## 常见问题

### `sh: pip: command not found`

本机使用 `pip3`，用以下命令代替：

```bash
npm run agent:install   # 已配置为 pip3
```

### `resource path 'binaries/agent-server-...' doesn't exist`

打包时会检查 sidecar 二进制是否存在。**开发阶段不需要** sidecar，保持 `tauri.conf.json` 中没有 `externalBin` 字段即可；只在正式打包前参照第三步添加。

### Rust 首次编译很慢

首次 `npm run dev` 需要编译 Rust 依赖，约 1-3 分钟。后续增量编译通常在 10 秒内。

### Python 后端未启动时 Agent 模式报错

确保在运行 `npm run dev` 前已在另一个终端启动 `npm run dev:agent`。报错信息通常为：

```
Failed to fetch / ERR_CONNECTION_REFUSED
```

### LLM API 配置

在应用设置中填写：
- **Base URL**：`https://aiplatform.njsrd.com`
- **API Key**：你的 Bearer Token
- **Model**：`qwen3.5-122b-a10b`（或其他可用模型）
