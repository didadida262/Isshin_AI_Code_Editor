use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// ── 消息类型 ──────────────────────────────────────────────────────────

enum WorkerMsg {
    Write(Vec<u8>),
    Resize(u16, u16),
}

// ── 全局状态：每个终端对应一个 Sender ───────────────────────────────

pub struct TerminalManager {
    handles: Mutex<HashMap<String, std::sync::mpsc::Sender<WorkerMsg>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }
}

// ── 命令 ──────────────────────────────────────────────────────────────

/// 创建一个新的 PTY 终端，并在后台线程中运行 shell。
/// 终端输出通过 `terminal-output-{id}` 事件推送到前端。
#[tauri::command]
pub fn create_terminal(
    app: AppHandle,
    state: tauri::State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<WorkerMsg>();
    let id_clone = id.clone();

    std::thread::spawn(move || {
        // ── 打开 PTY ──────────────────────────────────────────────
        let pty_system = native_pty_system();
        let pair = match pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(p) => p,
            Err(e) => {
                let _ = app.emit(&format!("terminal-exit-{}", id_clone), e.to_string());
                return;
            }
        };

        // ── 启动 shell ───────────────────────────────────────────
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "cmd.exe".to_string()
            } else {
                "/bin/zsh".to_string()
            }
        });

        let mut cmd = CommandBuilder::new(&shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LANG", "en_US.UTF-8");

        // 设置工作目录为当前打开的项目文件夹
        if let Some(ref dir) = cwd {
            if !dir.is_empty() {
                cmd.cwd(dir);
            }
        }

        let _child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(&format!("terminal-exit-{}", id_clone), e.to_string());
                return;
            }
        };

        // ── 获取 reader / writer（均为 Send） ────────────────────
        let mut reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(e) => {
                let _ = app.emit(&format!("terminal-exit-{}", id_clone), e.to_string());
                return;
            }
        };
        let mut writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(e) => {
                let _ = app.emit(&format!("terminal-exit-{}", id_clone), e.to_string());
                return;
            }
        };

        // ── 子线程：将 PTY 输出流式推送给前端 ────────────────────
        let app_out = app.clone();
        let id_out = id_clone.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => {
                        let _ = app_out.emit(&format!("terminal-exit-{}", id_out), ());
                        break;
                    }
                    Ok(n) => {
                        // 直接传原始字节的 lossy UTF-8，保留 ANSI 控制序列
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app_out.emit(&format!("terminal-output-{}", id_out), data);
                    }
                }
            }
        });

        // ── 主循环：处理写入 / resize 消息，持有 pair（保持 PTY 存活）──
        for msg in rx {
            match msg {
                WorkerMsg::Write(data) => {
                    let _ = writer.write_all(&data);
                }
                WorkerMsg::Resize(new_cols, new_rows) => {
                    let _ = pair.master.resize(PtySize {
                        rows: new_rows,
                        cols: new_cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
            }
        }
        // tx 被 drop 后（destroy_terminal / 面板关闭），rx 返回 Err，循环退出，pair 被释放
    });

    state.handles.lock().unwrap().insert(id, tx);
    Ok(())
}

/// 向终端写入数据（用户键盘输入）。
#[tauri::command]
pub fn write_terminal(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    let handles = state.handles.lock().unwrap();
    if let Some(tx) = handles.get(&id) {
        let _ = tx.send(WorkerMsg::Write(data.into_bytes()));
    }
    Ok(())
}

/// 通知 PTY 调整大小（行列数）。
#[tauri::command]
pub fn resize_terminal(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let handles = state.handles.lock().unwrap();
    if let Some(tx) = handles.get(&id) {
        let _ = tx.send(WorkerMsg::Resize(cols, rows));
    }
    Ok(())
}

/// 销毁终端（关闭 PTY，退出 shell）。
#[tauri::command]
pub fn destroy_terminal(
    state: tauri::State<'_, TerminalManager>,
    id: String,
) -> Result<(), String> {
    // drop sender → 工作线程的 for msg in rx 退出 → pair 被销毁 → shell 收到 SIGHUP
    state.handles.lock().unwrap().remove(&id);
    Ok(())
}
