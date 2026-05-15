mod commands;
mod config;
mod document;
mod error;
mod gateway;
mod proxy;
mod state;
mod terminal;
mod upstream;

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// 持有 agent-server sidecar 子进程句柄，防止被提前 drop。
struct AgentSidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

pub fn run() {
    let config = config::Config::from_env();
    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(10)
        .build()
        .expect("Failed to build HTTP client");

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown_tx = std::sync::Mutex::new(Some(shutdown_tx));

    let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let config_clone = config.clone();
    let client_clone = client.clone();
    rt.spawn(async move {
        if let Err(e) = proxy::start_server(config_clone, client_clone, shutdown_rx).await {
            log::error!("[api-proxy] server error: {}", e);
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AgentSidecar(std::sync::Mutex::new(None)))
        .manage(terminal::TerminalManager::new())
        .setup(|app| {
            // 仅在生产包中自动拉起 agent-server sidecar；
            // 开发阶段请手动执行：cd backend && uvicorn main:app --port 8788 --reload
            #[cfg(not(debug_assertions))]
            {
                match app.shell().sidecar("agent-server") {
                    Ok(cmd) => match cmd.spawn() {
                        Ok((_rx, child)) => {
                            log::info!("[agent-sidecar] agent-server started on :8788");
                            if let Some(state) = app.try_state::<AgentSidecar>() {
                                *state.0.lock().unwrap() = Some(child);
                            }
                        }
                        Err(e) => log::warn!("[agent-sidecar] spawn failed: {}", e),
                    },
                    Err(e) => log::warn!("[agent-sidecar] sidecar not found: {}", e),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_base_url,
            commands::open_folder_dialog,
            commands::read_dir_tree,
            commands::read_file_content,
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::destroy_terminal,
        ])
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _app_handle = window.app_handle();
                if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
                // on macOS keep app running even when all windows closed
                #[cfg(target_os = "macos")]
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
