use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const BACKUP_DIR_NAME: &str = ".nyamarkdownor-backups";
const MAX_BACKUPS_PER_FILE: usize = 24;
const MAX_WORKSPACE_FILES: usize = 800;
const SUPPORTED_MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkdn", "mdwn", "txt"];
const LINUX_DESKTOP_ENTRY: &str = "dev.nyamarkdownor.app.desktop";
const FILE_CHANGED_DURING_SAVE_ERROR: &str = "File changed on disk before save.";
#[cfg(windows)]
const CP_GBK: u32 = 936;
#[cfg(windows)]
const CP_GB18030: u32 = 54936;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    backup_path: Option<String>,
    stats: FileStats,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStats {
    modified_ms: u64,
    size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    name: String,
    modified_ms: u64,
    size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceListing {
    root_path: String,
    root_name: String,
    files: Vec<WorkspaceFileEntry>,
    truncated: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileEntry {
    path: String,
    name: String,
    relative_path: String,
    depth: usize,
    modified_ms: u64,
    size: u64,
}

#[derive(Debug, PartialEq, Eq)]
struct FileManagerCommandSpec {
  program: String,
  args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileAssociationScope {
    Markdown,
    PlainText,
}

#[derive(Default)]
struct PendingSecondaryInstancePaths {
    paths: Mutex<Vec<String>>,
}

impl FileAssociationScope {
    fn parse(scope: &str) -> Result<Self, String> {
        match scope {
            "markdown" => Ok(Self::Markdown),
            "plain-text" => Ok(Self::PlainText),
            _ => Err("Unsupported file association type.".to_string()),
        }
    }

    fn mime_type(self) -> &'static str {
        match self {
            Self::Markdown => "text/markdown",
            Self::PlainText => "text/plain",
        }
    }
}

#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
    let path = validate_markdown_path(path)?;
    read_text_file(&path, "file")
}

#[tauri::command]
fn initial_markdown_file_paths() -> Vec<String> {
    markdown_file_paths_from_args(std::env::args_os().skip(1))
}

#[tauri::command]
fn take_secondary_instance_markdown_paths(
    pending_paths: State<'_, PendingSecondaryInstancePaths>,
) -> Result<Vec<String>, String> {
    let mut paths = pending_paths
        .paths
        .lock()
        .map_err(|_| "Secondary-instance file queue is unavailable.".to_string())?;
    Ok(std::mem::take(&mut *paths))
}

#[tauri::command]
async fn pick_markdown_files(app: AppHandle) -> Result<Vec<String>, String> {
    run_file_dialog(move || {
        let files = app
            .dialog()
            .file()
            .set_title("Open Markdown Files")
            .add_filter("Markdown", SUPPORTED_MARKDOWN_EXTENSIONS)
            .blocking_pick_files()
            .unwrap_or_default();

        dialog_file_paths_to_strings(files)
    }).await
}

#[tauri::command]
async fn pick_markdown_workspace(app: AppHandle) -> Result<Option<String>, String> {
    run_file_dialog(move || {
        app.dialog()
            .file()
            .set_title("Open Folder")
            .blocking_pick_folder()
            .map(dialog_file_path_to_string)
            .transpose()
    }).await
}

#[tauri::command]
async fn pick_local_image_files(app: AppHandle) -> Result<Vec<String>, String> {
    run_file_dialog(move || {
        let files = app
            .dialog()
            .file()
            .set_title("Insert Local Images")
            .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"])
            .blocking_pick_files()
            .unwrap_or_default();

        dialog_file_paths_to_strings(files)
    }).await
}

#[tauri::command]
async fn pick_markdown_save_path(app: AppHandle, suggested_path: String) -> Result<Option<String>, String> {
    run_file_dialog(move || {
        let suggested_path = PathBuf::from(suggested_path);
        let (directory, file_name) = save_dialog_defaults(&suggested_path);
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Save Markdown File")
            .add_filter("Markdown", SUPPORTED_MARKDOWN_EXTENSIONS);

        if let Some(directory) = directory.as_deref() {
            dialog = dialog.set_directory(directory);
        }
        if let Some(file_name) = file_name {
            dialog = dialog.set_file_name(file_name);
        }

        dialog
            .blocking_save_file()
            .map(dialog_file_path_to_string)
            .transpose()
    }).await
}

#[tauri::command]
async fn pick_html_export_path(app: AppHandle, suggested_path: String) -> Result<Option<String>, String> {
    run_file_dialog(move || {
        let suggested_path = PathBuf::from(suggested_path);
        let (directory, file_name) = save_dialog_defaults(&suggested_path);
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Export HTML")
            .add_filter("HTML", &["html", "htm"]);

        if let Some(directory) = directory.as_deref() {
            dialog = dialog.set_directory(directory);
        }
        if let Some(file_name) = file_name {
            dialog = dialog.set_file_name(file_name);
        }

        dialog
            .blocking_save_file()
            .map(dialog_file_path_to_string)
            .transpose()
    }).await
}

#[tauri::command]
fn write_markdown_file(
    path: String,
    content: String,
    expected_stats: Option<FileStats>,
    expected_missing: bool,
) -> Result<WriteResult, String> {
    let path = validate_markdown_path(path)?;
    if expected_missing {
        verify_expected_file_missing(&path)?;
    } else if let Some(expected_stats) = expected_stats {
        verify_expected_file_stats(&path, expected_stats)?;
    }
    let backup_path = backup_existing_file(&path).map_err(|error| format!("Failed to create backup: {error}"))?;
    atomic_write(&path, content.as_bytes()).map_err(|error| format!("Failed to write file: {error}"))?;
    let stats = file_stats_for(&path).map_err(|error| format!("Failed to inspect file after save: {error}"))?;

    Ok(WriteResult {
        backup_path: backup_path.map(|path| path.to_string_lossy().to_string()),
        stats,
    })
}

#[tauri::command]
fn create_markdown_file(path: String, content: String) -> Result<WriteResult, String> {
    let path = validate_markdown_path(path)?;
    create_new_file(&path, content.as_bytes()).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            "File already exists.".to_string()
        } else {
            format!("Failed to create file: {error}")
        }
    })?;
    let stats = file_stats_for(&path).map_err(|error| format!("Failed to inspect file after create: {error}"))?;

    Ok(WriteResult {
        backup_path: None,
        stats,
    })
}

#[tauri::command]
fn write_export_file(path: String, content: String) -> Result<(), String> {
    let path = validate_export_path(path)?;
    atomic_write(&path, content.as_bytes()).map_err(|error| format!("Failed to write export: {error}"))
}

#[tauri::command]
fn stat_markdown_file(path: String) -> Result<FileStats, String> {
    let path = validate_markdown_path(path)?;
    file_stats_for(&path).map_err(|error| format!("Failed to inspect file: {error}"))
}

#[tauri::command]
fn existing_markdown_file_stats(path: String) -> Result<Option<FileStats>, String> {
    let path = validate_markdown_path(path)?;
    match file_stats_for(&path) {
        Ok(stats) => Ok(Some(stats)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to inspect file before save: {error}")),
    }
}

#[tauri::command]
fn reveal_markdown_file(path: String) -> Result<(), String> {
  let path = validate_markdown_path(path)?;
  reveal_path_in_file_manager(&path)
}

#[tauri::command]
fn manage_file_association(scope: String) -> Result<(), String> {
    let scope = FileAssociationScope::parse(&scope)?;
    let command = file_association_command(scope, std::env::consts::OS)?;

    Command::new(&command.program)
        .args(&command.args)
        .spawn()
        .map_err(|error| format!("Failed to open file association settings: {error}"))?;

    Ok(())
}

#[tauri::command]
fn list_markdown_backups(path: String) -> Result<Vec<BackupEntry>, String> {
    let source_path = validate_markdown_path(path)?;
    let backup_dir = backup_dir_for_source(&source_path);
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let prefix = backup_prefix_for_source(&source_path);
    let mut backups = Vec::new();

    for entry in fs::read_dir(&backup_dir).map_err(|error| format!("Failed to read backups: {error}"))? {
        let entry = entry.map_err(|error| format!("Failed to inspect backup: {error}"))?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) || !name.ends_with(".bak") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| format!("Failed to inspect backup metadata: {error}"))?;
        backups.push(BackupEntry {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            modified_ms: modified_ms(metadata.modified().unwrap_or(UNIX_EPOCH)),
            size: metadata.len(),
        });
    }

    backups.sort_by(|left, right| right.modified_ms.cmp(&left.modified_ms));
    Ok(backups)
}

#[tauri::command]
fn list_markdown_workspace(root_path: String) -> Result<WorkspaceListing, String> {
    let root_path = validate_workspace_root(root_path)?;
    let root_name = root_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Workspace")
        .to_string();
    let mut files = Vec::new();
    let mut truncated = false;

    collect_workspace_files(&root_path, &root_path, &mut files, &mut truncated);
    files.sort_by(|left, right| {
        left.relative_path
            .to_ascii_lowercase()
            .cmp(&right.relative_path.to_ascii_lowercase())
    });

    Ok(WorkspaceListing {
        root_path: root_path.to_string_lossy().to_string(),
        root_name,
        files,
        truncated,
    })
}

#[tauri::command]
fn read_markdown_backup(source_path: String, backup_path: String) -> Result<String, String> {
    let source_path = validate_markdown_path(source_path)?;
    let backup_path = validate_backup_path(&source_path, backup_path)?;

    read_text_file(&backup_path, "backup")
}

#[tauri::command]
fn read_app_state_file(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = app_state_file_path(&app, &name)?;

    match fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read app state: {error}")),
    }
}

#[tauri::command]
fn write_app_state_file(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = app_state_file_path(&app, &name)?;
    let parent = path
        .parent()
        .ok_or_else(|| "App state path has no parent folder.".to_string())?;

    fs::create_dir_all(parent).map_err(|error| format!("Failed to prepare app state folder: {error}"))?;
    atomic_write(&path, content.as_bytes()).map_err(|error| format!("Failed to write app state: {error}"))
}

fn app_state_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    validate_app_state_file_name(name)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to locate app data folder: {error}"))?;

    Ok(app_data_dir.join(name))
}

fn validate_app_state_file_name(name: &str) -> Result<(), String> {
    match name {
        "document-tabs-v1.json"
        | "draft-document-v1.json"
        | "draft-snapshots-v1.json"
        | "preferences-v1.json"
        | "recent-files-v1.json"
        | "workspace-root-v1.json" => Ok(()),
        _ => Err("Unsupported app state file.".to_string()),
    }
}

fn validate_workspace_root(path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err("Workspace must be a folder.".to_string());
    }

    path.canonicalize()
        .map_err(|error| format!("Failed to inspect workspace folder: {error}"))
}

fn validate_markdown_path(path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        return Err("Cannot open a directory as a Markdown file.".to_string());
    }

    let extension = Path::new(&path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if is_supported_markdown_extension(&extension) {
        Ok(path)
    } else {
        Err("Only Markdown and plain text files are supported.".to_string())
    }
}

fn validate_export_path(path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        return Err("Cannot export over a directory.".to_string());
    }

    let extension = Path::new(&path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "html" | "htm" => Ok(path),
        _ => Err("Only HTML export files are supported.".to_string()),
    }
}

fn is_supported_markdown_path(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    is_supported_markdown_extension(&extension)
}

fn is_supported_markdown_extension(extension: &str) -> bool {
    SUPPORTED_MARKDOWN_EXTENSIONS.contains(&extension)
}

fn markdown_file_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = OsString>,
{
    let mut seen = HashSet::new();
    let mut paths = Vec::new();

    for arg in args {
        let candidate = PathBuf::from(arg);
        if !candidate.is_file() || !is_supported_markdown_path(&candidate) {
            continue;
        }

        let path = candidate.canonicalize().unwrap_or(candidate);
        let path_string = path.to_string_lossy().to_string();
        if seen.insert(local_path_key(&path_string)) {
            paths.push(path_string);
        }
    }

    paths
}

fn secondary_instance_markdown_paths(args: Vec<String>) -> Vec<String> {
    markdown_file_paths_from_args(args.into_iter().skip(1).map(OsString::from))
}

fn local_path_key(path: &str) -> String {
    if cfg!(windows) {
        path.replace('\\', "/").to_ascii_lowercase()
    } else {
        path.to_string()
    }
}

fn reveal_path_in_file_manager(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|error| format!("Failed to inspect file before reveal: {error}"))?;
    let command = reveal_command_for_platform(path, metadata.is_dir(), std::env::consts::OS)?;

    Command::new(&command.program)
        .args(&command.args)
        .spawn()
        .map_err(|error| format!("Failed to open file manager: {error}"))?;

    Ok(())
}

fn file_association_command(
    scope: FileAssociationScope,
    platform: &str,
) -> Result<FileManagerCommandSpec, String> {
    match platform {
        "windows" => Ok(FileManagerCommandSpec {
            program: "explorer.exe".to_string(),
            args: vec!["ms-settings:defaultapps".to_string()],
        }),
        "macos" => Ok(FileManagerCommandSpec {
            program: "open".to_string(),
            args: vec!["x-apple.systempreferences:com.apple.preference.general".to_string()],
        }),
        "linux" => Ok(FileManagerCommandSpec {
            program: "xdg-mime".to_string(),
            args: vec![
                "default".to_string(),
                LINUX_DESKTOP_ENTRY.to_string(),
                scope.mime_type().to_string(),
            ],
        }),
        _ => Err("File association settings are unsupported on this platform.".to_string()),
    }
}

fn reveal_command_for_platform(path: &Path, is_dir: bool, platform: &str) -> Result<FileManagerCommandSpec, String> {
    match platform {
        "windows" => Ok(FileManagerCommandSpec {
            program: "explorer.exe".to_string(),
            args: if is_dir {
                vec![path_to_string(path)]
            } else {
                vec![format!("/select,{}", path_to_string(path))]
            },
        }),
        "macos" => Ok(FileManagerCommandSpec {
            program: "open".to_string(),
            args: if is_dir {
                vec![path_to_string(path)]
            } else {
                vec!["-R".to_string(), path_to_string(path)]
            },
        }),
        _ => {
            let target = if is_dir {
                path
            } else {
                path.parent()
                    .ok_or_else(|| "File has no parent folder to reveal.".to_string())?
            };

            Ok(FileManagerCommandSpec {
                program: "xdg-open".to_string(),
                args: vec![path_to_string(target)],
            })
        }
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

async fn run_file_dialog<T, F>(dialog: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(dialog)
        .await
        .map_err(|error| format!("File dialog failed: {error}"))?
}

fn save_dialog_defaults(suggested_path: &Path) -> (Option<PathBuf>, Option<String>) {
    let directory = suggested_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty() && path.exists())
        .map(Path::to_path_buf);
    let file_name = suggested_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string);

    (directory, file_name)
}

fn dialog_file_paths_to_strings(paths: Vec<tauri_plugin_dialog::FilePath>) -> Result<Vec<String>, String> {
    paths.into_iter().map(dialog_file_path_to_string).collect()
}

fn dialog_file_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    path.simplified()
        .into_path()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| format!("Selected item is not a local filesystem path: {error}"))
}

fn file_stats_for(path: &Path) -> std::io::Result<FileStats> {
    let metadata = fs::metadata(path)?;
    Ok(FileStats {
        modified_ms: modified_ms(metadata.modified().unwrap_or(UNIX_EPOCH)),
        size: metadata.len(),
    })
}

fn verify_expected_file_stats(path: &Path, expected_stats: FileStats) -> Result<(), String> {
    let current_stats = match file_stats_for(path) {
        Ok(stats) => stats,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(FILE_CHANGED_DURING_SAVE_ERROR.to_string());
        }
        Err(error) => return Err(format!("Failed to inspect file before save: {error}")),
    };

    if current_stats == expected_stats {
        Ok(())
    } else {
        Err(FILE_CHANGED_DURING_SAVE_ERROR.to_string())
    }
}

fn verify_expected_file_missing(path: &Path) -> Result<(), String> {
    match file_stats_for(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err(FILE_CHANGED_DURING_SAVE_ERROR.to_string()),
        Err(error) => Err(format!("Failed to inspect file before save: {error}")),
    }
}

fn collect_workspace_files(root_path: &Path, folder: &Path, files: &mut Vec<WorkspaceFileEntry>, truncated: &mut bool) {
    if files.len() >= MAX_WORKSPACE_FILES {
        *truncated = true;
        return;
    }

    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };

    let mut entries = entries.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .to_ascii_lowercase()
    });

    for entry in entries {
        if files.len() >= MAX_WORKSPACE_FILES {
            *truncated = true;
            return;
        }

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if !should_skip_workspace_dir(&name) {
                collect_workspace_files(root_path, &path, files, truncated);
            }
            continue;
        }

        if !file_type.is_file() || !is_supported_markdown_path(&path) {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let relative_path = path
            .strip_prefix(root_path)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let depth = relative_path.matches('/').count();

        files.push(WorkspaceFileEntry {
            path: path.to_string_lossy().to_string(),
            name,
            relative_path,
            depth,
            modified_ms: modified_ms(metadata.modified().unwrap_or(UNIX_EPOCH)),
            size: metadata.len(),
        });
    }
}

fn should_skip_workspace_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".hg" | ".svn" | ".nyamarkdownor-backups" | "node_modules" | "target" | "dist"
    )
}

fn validate_backup_path(source_path: &Path, backup_path: String) -> Result<PathBuf, String> {
    let backup_path = PathBuf::from(backup_path);
    if backup_path.is_dir() {
        return Err("Cannot open a directory as a backup file.".to_string());
    }

    let canonical_backup_dir = backup_dir_for_source(source_path)
        .canonicalize()
        .map_err(|_| "Backup folder does not exist.".to_string())?;
    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|_| "Backup file does not exist.".to_string())?;

    if !canonical_backup.starts_with(&canonical_backup_dir) {
        return Err("Backup is outside the current file backup folder.".to_string());
    }

    let Some(name) = canonical_backup.file_name().and_then(|value| value.to_str()) else {
        return Err("Backup file has no name.".to_string());
    };
    let prefix = backup_prefix_for_source(source_path);
    if !name.starts_with(&prefix) || !name.ends_with(".bak") {
        return Err("Backup does not belong to the current file.".to_string());
    }

    Ok(canonical_backup)
}

fn read_text_file(path: &Path, label: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("Failed to read {label}: {error}"))?;
    decode_text_bytes(bytes).map_err(|error| format!("Failed to decode {label}: {error}"))
}

fn decode_text_bytes(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let mut text = String::from_utf8(bytes)
            .map_err(|error| format!("Invalid UTF-8 text after BOM: {error}"))?;
        text.remove(0);
        return Ok(text);
    }

    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16_bytes(&bytes[2..], u16::from_le_bytes, "UTF-16 LE");
    }

    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16_bytes(&bytes[2..], u16::from_be_bytes, "UTF-16 BE");
    }

    match String::from_utf8(bytes) {
        Ok(text) => Ok(text),
        Err(error) => {
            let utf8_error = error.utf8_error();
            let bytes = error.into_bytes();
            decode_platform_legacy_text(&bytes)
                .map_err(|fallback_error| format!("File is not valid UTF-8 or UTF-16 text: {utf8_error}; {fallback_error}"))
        }
    }
}

fn decode_utf16_bytes(
    bytes: &[u8],
    decode_word: fn([u8; 2]) -> u16,
    label: &str,
) -> Result<String, String> {
    if bytes.len() % 2 != 0 {
        return Err(format!("{label} text has an incomplete trailing byte."));
    }

    let words = bytes
        .chunks_exact(2)
        .map(|chunk| decode_word([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();

    String::from_utf16(&words).map_err(|error| format!("Invalid {label} text: {error}"))
}

#[cfg(windows)]
fn decode_platform_legacy_text(bytes: &[u8]) -> Result<String, String> {
    use windows_sys::Win32::Globalization::CP_ACP;

    for code_page in [CP_GB18030, CP_GBK, CP_ACP] {
        if let Ok(text) = decode_windows_code_page(bytes, code_page) {
            return Ok(text);
        }
    }

    Err("legacy Windows text decoding failed".to_string())
}

#[cfg(windows)]
fn decode_windows_code_page(bytes: &[u8], code_page: u32) -> Result<String, String> {
    decode_windows_code_page_with_flags(bytes, code_page, windows_sys::Win32::Globalization::MB_ERR_INVALID_CHARS)
}

#[cfg(windows)]
fn decode_windows_code_page_with_flags(bytes: &[u8], code_page: u32, flags: u32) -> Result<String, String> {
    use windows_sys::Win32::Globalization::MultiByteToWideChar;

    if bytes.is_empty() {
        return Ok(String::new());
    }

    let input_len = i32::try_from(bytes.len()).map_err(|_| "file is too large to decode with Windows code pages".to_string())?;
    let required_len = unsafe {
        MultiByteToWideChar(
            code_page,
            flags,
            bytes.as_ptr(),
            input_len,
            std::ptr::null_mut(),
            0,
        )
    };
    if required_len <= 0 {
        return Err("Windows code page probe failed".to_string());
    }

    let mut words = vec![0u16; required_len as usize];
    let written_len = unsafe {
        MultiByteToWideChar(
            code_page,
            flags,
            bytes.as_ptr(),
            input_len,
            words.as_mut_ptr(),
            required_len,
        )
    };
    if written_len <= 0 {
        return Err("Windows code page decode failed".to_string());
    }

    words.truncate(written_len as usize);
    String::from_utf16(&words).map_err(|error| format!("Invalid Windows text: {error}"))
}

#[cfg(not(windows))]
fn decode_platform_legacy_text(_bytes: &[u8]) -> Result<String, String> {
    Err("no platform legacy text decoder is available".to_string())
}

fn create_new_file(path: &Path, content: &[u8]) -> std::io::Result<()> {
    ensure_writable_parent(path)?;

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(content)?;
    file.sync_all()
}

fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = ensure_writable_parent(path)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.md");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = parent.join(format!(".{file_name}.{nonce}.tmp"));
    let rollback_path = parent.join(format!(".{file_name}.{nonce}.rollback"));

    {
        let mut temp_file = fs::File::create(&temp_path)?;
        temp_file.write_all(content)?;
        temp_file.sync_all()?;
    }

    if path.exists() {
        preserve_existing_file_permissions(path, &temp_path)?;
        fs::rename(path, &rollback_path)?;
        if let Err(error) = fs::rename(&temp_path, path) {
            let _ = fs::rename(&rollback_path, path);
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }
        let _ = fs::remove_file(&rollback_path);
    } else {
        fs::rename(&temp_path, path)?;
    }

    Ok(())
}

#[cfg(unix)]
fn preserve_existing_file_permissions(path: &Path, temp_path: &Path) -> std::io::Result<()> {
    fs::set_permissions(temp_path, fs::metadata(path)?.permissions())
}

#[cfg(not(unix))]
fn preserve_existing_file_permissions(_path: &Path, _temp_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn ensure_writable_parent(path: &Path) -> std::io::Result<&Path> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    match fs::metadata(parent) {
        Ok(metadata) if metadata.is_dir() => Ok(parent),
        Ok(_) => Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Destination parent is not a folder.",
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Destination folder does not exist.",
        )),
        Err(error) => Err(error),
    }
}

fn backup_existing_file(path: &Path) -> std::io::Result<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }

    let backup_dir = backup_dir_for_source(path);
    fs::create_dir_all(&backup_dir)?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let backup_path = backup_dir.join(format!("{}{nonce}.bak", backup_prefix_for_source(path)));

    fs::copy(path, &backup_path)?;
    prune_old_backups(&backup_dir, path, MAX_BACKUPS_PER_FILE)?;
    Ok(Some(backup_path))
}

fn prune_old_backups(backup_dir: &Path, source_path: &Path, retain: usize) -> std::io::Result<()> {
    let prefix = backup_prefix_for_source(source_path);
    let mut backups = Vec::new();

    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) || !name.ends_with(".bak") {
            continue;
        }

        let modified = entry.metadata()?.modified().unwrap_or(UNIX_EPOCH);
        backups.push((modified, path));
    }

    if backups.len() <= retain {
        return Ok(());
    }

    backups.sort_by_key(|(modified, _path)| *modified);
    let remove_count = backups.len() - retain;
    for (_modified, path) in backups.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }

    Ok(())
}

fn backup_dir_for_source(path: &Path) -> PathBuf {
    path.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(BACKUP_DIR_NAME)
}

fn backup_prefix_for_source(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.md");
    format!("{}.", sanitize_backup_name(file_name))
}

fn modified_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn sanitize_backup_name(file_name: &str) -> String {
    file_name
        .chars()
        .map(|char| match char {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => char,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{atomic_write, create_new_file, decode_text_bytes, file_association_command, file_stats_for, markdown_file_paths_from_args, reveal_command_for_platform, save_dialog_defaults, secondary_instance_markdown_paths, verify_expected_file_missing, verify_expected_file_stats, FileAssociationScope, FileManagerCommandSpec, FILE_CHANGED_DURING_SAVE_ERROR};

    #[test]
    fn decodes_utf8_with_bom() {
        let bytes = [0xEF, 0xBB, 0xBF, b'H', b'i'];
        assert_eq!(decode_text_bytes(bytes.to_vec()).unwrap(), "Hi");
    }

    #[test]
    fn decodes_utf16_little_endian_with_bom() {
        let bytes = [0xFF, 0xFE, 0x60, 0x4F, 0x7D, 0x59];
        assert_eq!(decode_text_bytes(bytes.to_vec()).unwrap(), "你好");
    }

    #[test]
    fn decodes_utf16_big_endian_with_bom() {
        let bytes = [0xFE, 0xFF, 0x4F, 0x60, 0x59, 0x7D];
        assert_eq!(decode_text_bytes(bytes.to_vec()).unwrap(), "你好");
    }

    #[cfg(windows)]
    #[test]
    fn decodes_legacy_chinese_windows_text() {
        let bytes = [0xC4, 0xE3, 0xBA, 0xC3];
        assert_eq!(decode_text_bytes(bytes.to_vec()).unwrap(), "你好");
    }

    #[test]
    fn builds_windows_reveal_command_for_file_selection() {
        assert_eq!(
            reveal_command_for_platform(Path::new(r"D:\notes\Draft.md"), false, "windows").unwrap(),
            FileManagerCommandSpec {
                program: "explorer.exe".to_string(),
                args: vec![r"/select,D:\notes\Draft.md".to_string()],
            }
        );
    }

    #[test]
    fn builds_macos_reveal_command_for_file_selection() {
        assert_eq!(
            reveal_command_for_platform(Path::new("/Users/me/notes/Draft.md"), false, "macos").unwrap(),
            FileManagerCommandSpec {
                program: "open".to_string(),
                args: vec!["-R".to_string(), "/Users/me/notes/Draft.md".to_string()],
            }
        );
    }

    #[test]
    fn builds_linux_reveal_command_for_parent_folder() {
        assert_eq!(
            reveal_command_for_platform(Path::new("/home/me/notes/Draft.md"), false, "linux").unwrap(),
            FileManagerCommandSpec {
                program: "xdg-open".to_string(),
                args: vec!["/home/me/notes".to_string()],
            }
        );
    }

    #[test]
    fn builds_file_association_commands_for_each_supported_platform() {
        assert_eq!(
            file_association_command(FileAssociationScope::Markdown, "windows").unwrap(),
            FileManagerCommandSpec {
                program: "explorer.exe".to_string(),
                args: vec!["ms-settings:defaultapps".to_string()],
            }
        );
        assert_eq!(
            file_association_command(FileAssociationScope::PlainText, "macos").unwrap(),
            FileManagerCommandSpec {
                program: "open".to_string(),
                args: vec!["x-apple.systempreferences:com.apple.preference.general".to_string()],
            }
        );
        assert_eq!(
            file_association_command(FileAssociationScope::Markdown, "linux").unwrap(),
            FileManagerCommandSpec {
                program: "xdg-mime".to_string(),
                args: vec![
                    "default".to_string(),
                    "dev.nyamarkdownor.app.desktop".to_string(),
                    "text/markdown".to_string(),
                ],
            }
        );
    }

    #[test]
    fn save_dialog_defaults_split_existing_parent_and_file_name() {
        let root = temporary_test_dir("save-dialog-existing-parent");
        let target = root.join("Draft.md");

        let (directory, file_name) = save_dialog_defaults(&target);

        assert_eq!(directory.as_deref(), Some(root.as_path()));
        assert_eq!(file_name.as_deref(), Some("Draft.md"));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_dialog_defaults_keep_file_name_without_a_starting_folder() {
        let root = temporary_test_dir("save-dialog-missing-parent");
        let missing_parent_target = root.join("missing").join("Draft.md");

        let (missing_directory, missing_file_name) = save_dialog_defaults(&missing_parent_target);
        let (bare_directory, bare_file_name) = save_dialog_defaults(Path::new("Untitled.md"));

        assert_eq!(missing_directory, None);
        assert_eq!(missing_file_name.as_deref(), Some("Draft.md"));
        assert_eq!(bare_directory, None);
        assert_eq!(bare_file_name.as_deref(), Some("Untitled.md"));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn initial_markdown_paths_only_include_existing_supported_files() {
        let root = temporary_test_dir("launch-filter");
        let markdown = root.join("Draft.mdown");
        let text = root.join("Notes.txt");
        let image = root.join("Image.png");
        let folder = root.join("Folder.md");
        std::fs::write(&markdown, "# Draft").unwrap();
        std::fs::write(&text, "Plain text").unwrap();
        std::fs::write(&image, "not markdown").unwrap();
        std::fs::create_dir(&folder).unwrap();

        let paths = markdown_file_paths_from_args(vec![
            markdown.clone().into_os_string(),
            image.into_os_string(),
            folder.into_os_string(),
            root.join("Missing.md").into_os_string(),
            text.clone().into_os_string(),
        ]);

        assert_eq!(
            paths,
            vec![
                markdown.canonicalize().unwrap().to_string_lossy().to_string(),
                text.canonicalize().unwrap().to_string_lossy().to_string(),
            ]
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn initial_markdown_paths_deduplicate_launch_args() {
        let root = temporary_test_dir("launch-deduplicate");
        let markdown = root.join("Draft.md");
        std::fs::write(&markdown, "# Draft").unwrap();

        let paths = markdown_file_paths_from_args(vec![
            markdown.clone().into_os_string(),
            markdown.clone().into_os_string(),
        ]);

        assert_eq!(paths, vec![markdown.canonicalize().unwrap().to_string_lossy().to_string()]);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn secondary_instance_paths_ignore_the_program_and_keep_supported_files() {
        let root = temporary_test_dir("secondary-instance-open");
        let markdown = root.join("Draft.mdown");
        let image = root.join("Image.png");
        std::fs::write(&markdown, "# Draft").unwrap();
        std::fs::write(&image, "not markdown").unwrap();

        let paths = secondary_instance_markdown_paths(vec![
            "nya-markdownor".to_string(),
            markdown.to_string_lossy().to_string(),
            image.to_string_lossy().to_string(),
        ]);

        assert_eq!(paths, vec![markdown.canonicalize().unwrap().to_string_lossy().to_string()]);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn create_new_file_reports_missing_destination_folder() {
        let root = temporary_test_dir("create-missing-parent");
        let path = root.join("missing").join("Draft.md");

        let error = create_new_file(&path, b"# Draft").unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        assert_eq!(error.to_string(), "Destination folder does not exist.");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_write_reports_parent_that_is_not_a_folder() {
        let root = temporary_test_dir("write-parent-file");
        let parent_file = root.join("parent.md");
        std::fs::write(&parent_file, "not a folder").unwrap();
        let path = parent_file.join("Draft.md");

        let error = atomic_write(&path, b"# Draft").unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(error.to_string(), "Destination parent is not a folder.");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_write_creates_and_replaces_files_in_existing_folders() {
        let root = temporary_test_dir("atomic-write-existing-parent");
        let path = root.join("Draft.md");

        atomic_write(&path, b"# Draft").unwrap();
        atomic_write(&path, b"# Updated").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Updated");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let root = temporary_test_dir("atomic-write-permissions");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Draft").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();

        atomic_write(&path, b"# Updated").unwrap();

        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o640);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expected_file_stats_reject_an_external_change_before_save() {
        let root = temporary_test_dir("write-expected-stats");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Draft").unwrap();
        let expected_stats = file_stats_for(&path).unwrap();

        std::fs::write(&path, "# External change").unwrap();

        assert_eq!(
            verify_expected_file_stats(&path, expected_stats).unwrap_err(),
            FILE_CHANGED_DURING_SAVE_ERROR
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expected_missing_file_rejects_an_external_create_before_save() {
        let root = temporary_test_dir("write-expected-missing");
        let path = root.join("Draft.md");

        std::fs::write(&path, "# External create").unwrap();

        assert_eq!(
            verify_expected_file_missing(&path).unwrap_err(),
            FILE_CHANGED_DURING_SAVE_ERROR
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    fn temporary_test_dir(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nya-markdownor-{label}-{nonce}"));
        std::fs::create_dir(&path).unwrap();
        path
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths = secondary_instance_markdown_paths(args);
            if !paths.is_empty() {
                let pending_paths = app.state::<PendingSecondaryInstancePaths>();
                if let Ok(mut pending_paths) = pending_paths.paths.lock() {
                    pending_paths.extend(paths.iter().cloned());
                }
                let _ = app.emit("open-markdown-files", paths);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(PendingSecondaryInstancePaths::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_markdown_file,
            existing_markdown_file_stats,
            initial_markdown_file_paths,
            take_secondary_instance_markdown_paths,
            pick_html_export_path,
            pick_local_image_files,
            pick_markdown_files,
            pick_markdown_save_path,
            pick_markdown_workspace,
            read_app_state_file,
            read_markdown_file,
            read_markdown_backup,
            reveal_markdown_file,
            list_markdown_backups,
            list_markdown_workspace,
            manage_file_association,
            stat_markdown_file,
            write_export_file,
            write_app_state_file,
            write_markdown_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running NyaMarkdownor");
}
