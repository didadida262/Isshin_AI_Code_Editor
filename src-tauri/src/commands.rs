use std::path::Path;
use serde::Serialize;

#[tauri::command]
pub fn get_api_base_url() -> String {
    "http://127.0.0.1:8787".to_string()
}

// ── 文件树节点（与前端 FileNode 对应） ──────────────────────────────

#[derive(Serialize, Clone)]
pub struct DirNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub ext: Option<String>,
    pub children: Option<Vec<DirNode>>,
}

// ── 打开文件夹对话框 ──────────────────────────────────────────────────

#[tauri::command]
pub async fn open_folder_dialog() -> Option<String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("选择项目文件夹")
        .pick_folder()
        .await;
    handle.map(|h| h.path().to_string_lossy().to_string())
}

// ── 递归读取目录树 ────────────────────────────────────────────────────

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", "__pycache__", ".venv", "venv",
    "dist", ".git", "build", ".next", ".nuxt", ".turbo",
    ".yarn", "out", "coverage", ".cache",
];

#[tauri::command]
pub fn read_dir_tree(path: String) -> Result<Vec<DirNode>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }
    read_recursive(dir, 0, 8).map_err(|e| e.to_string())
}

fn read_recursive(dir: &Path, depth: u32, max_depth: u32) -> std::io::Result<Vec<DirNode>> {
    if depth > max_depth {
        return Ok(vec![]);
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let s = name.to_string_lossy();
            !s.starts_with('.') && !SKIP_DIRS.contains(&s.as_ref())
        })
        .collect();

    // 目录优先，同类按字母排序
    entries.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    let mut nodes = vec![];
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let id = path.to_string_lossy().to_string();

        if path.is_dir() {
            let children = read_recursive(&path, depth + 1, max_depth)?;
            nodes.push(DirNode {
                id,
                name,
                node_type: "dir".to_string(),
                ext: None,
                children: Some(children),
            });
        } else {
            let ext = path.extension().map(|e| e.to_string_lossy().to_string());
            nodes.push(DirNode {
                id,
                name,
                node_type: "file".to_string(),
                ext,
                children: None,
            });
        }
    }
    Ok(nodes)
}

// ── 读取文件内容 ──────────────────────────────────────────────────────

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;

    // 简单二进制检测：前 8000 字节出现 null byte 即视为二进制
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Err("Binary file".to_string());
    }
    // 超过 2MB 不展示
    if bytes.len() > 2_000_000 {
        return Err("File too large (>2MB)".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "Not valid UTF-8".to_string())
}
