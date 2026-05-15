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

// ── 工作区搜索（文件名 / 文件内容）───────────────────────────────────────

/// 与前端 SearchPanel 对应；`line` 为 0 表示「仅文件名」命中。
#[derive(Serialize, Clone)]
pub struct WorkspaceSearchHit {
    pub path: String,
    pub line: u32,
    pub preview: String,
}

const SEARCH_MAX_DEPTH: u32 = 10;
const SEARCH_MAX_HITS: usize = 500;
const SEARCH_MAX_FILES_SCAN: usize = 5_000;
const SEARCH_MAX_BYTES: usize = 512 * 1024;

fn rel_path_from_root(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn line_contains(line: &str, needle_raw: &str, needle_lower: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        line.contains(needle_raw)
    } else {
        line.to_lowercase().contains(needle_lower)
    }
}

fn path_matches(rel: &str, name: &str, needle_raw: &str, needle_lower: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        rel.contains(needle_raw) || name.contains(needle_raw)
    } else {
        rel.to_lowercase().contains(needle_lower) || name.to_lowercase().contains(needle_lower)
    }
}

fn preview_line(line: &str) -> String {
    let t = line.trim_end_matches(['\r', '\n']);
    const MAX: usize = 240;
    let count = t.chars().count();
    if count <= MAX {
        t.to_string()
    } else {
        format!("{}…", t.chars().take(MAX).collect::<String>())
    }
}

fn scan_file_content(
    abs_path: &Path,
    needle_raw: &str,
    needle_lower: &str,
    case_sensitive: bool,
    hits: &mut Vec<WorkspaceSearchHit>,
) -> Result<(), ()> {
    let bytes = std::fs::read(abs_path).map_err(|_| ())?;
    if bytes.len() > SEARCH_MAX_BYTES {
        return Err(());
    }
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Err(());
    }
    let text = String::from_utf8(bytes).map_err(|_| ())?;
    for (idx, line) in text.lines().enumerate() {
        if hits.len() >= SEARCH_MAX_HITS {
            break;
        }
        let n = (idx + 1) as u32;
        if line_contains(line, needle_raw, needle_lower, case_sensitive) {
            hits.push(WorkspaceSearchHit {
                path: abs_path.to_string_lossy().to_string(),
                line: n,
                preview: preview_line(line),
            });
        }
    }
    Ok(())
}

fn search_workspace_files_only(
    root: &Path,
    dir: &Path,
    needle_raw: &str,
    needle_lower: &str,
    case_sensitive: bool,
    depth: u32,
    hits: &mut Vec<WorkspaceSearchHit>,
) -> Result<(), String> {
    if depth > SEARCH_MAX_DEPTH || hits.len() >= SEARCH_MAX_HITS {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
            continue;
        }
        let rel = rel_path_from_root(root, &path);
        if path.is_dir() {
            search_workspace_files_only(root, &path, needle_raw, needle_lower, case_sensitive, depth + 1, hits)?;
        } else if path_matches(&rel, &name, needle_raw, needle_lower, case_sensitive) {
            hits.push(WorkspaceSearchHit {
                path: path.to_string_lossy().to_string(),
                line: 0,
                preview: rel,
            });
            if hits.len() >= SEARCH_MAX_HITS {
                break;
            }
        }
    }
    Ok(())
}

fn search_workspace_content(
    dir: &Path,
    needle_raw: &str,
    needle_lower: &str,
    case_sensitive: bool,
    depth: u32,
    hits: &mut Vec<WorkspaceSearchHit>,
    files_scanned: &mut usize,
) -> Result<(), String> {
    if depth > SEARCH_MAX_DEPTH || hits.len() >= SEARCH_MAX_HITS || *files_scanned >= SEARCH_MAX_FILES_SCAN {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
            continue;
        }
        if path.is_dir() {
            search_workspace_content(&path, needle_raw, needle_lower, case_sensitive, depth + 1, hits, files_scanned)?;
            continue;
        }
        if *files_scanned >= SEARCH_MAX_FILES_SCAN || hits.len() >= SEARCH_MAX_HITS {
            break;
        }
        *files_scanned += 1;
        let _ = scan_file_content(&path, needle_raw, needle_lower, case_sensitive, hits);
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_search(
    root: String,
    query: String,
    case_sensitive: bool,
    files_only: bool,
) -> Result<Vec<WorkspaceSearchHit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }
    let dir = Path::new(&root);
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", root));
    }
    let needle_raw = query.to_string();
    let needle_lower = query.to_lowercase();
    let mut hits = Vec::new();
    if files_only {
        search_workspace_files_only(dir, dir, &needle_raw, &needle_lower, case_sensitive, 0, &mut hits)?;
    } else {
        let mut files_scanned = 0usize;
        search_workspace_content(dir, &needle_raw, &needle_lower, case_sensitive, 0, &mut hits, &mut files_scanned)?;
    }
    Ok(hits)
}
