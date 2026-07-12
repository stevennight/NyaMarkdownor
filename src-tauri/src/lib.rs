use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const CENTRAL_BACKUP_DIR_NAME: &str = "backups-v1";
const CUSTOM_BACKUP_CONTAINER_NAME: &str = "NyaMarkdownor Backups";
const LEGACY_BACKUP_DIR_NAME: &str = ".nyamarkdownor-backups";
const SOURCE_METADATA_FILE_NAME: &str = "source.json";
const MIB: u64 = 1024 * 1024;
const MAX_PREVIOUS_DIRECTORIES: usize = 16;
const MAX_CHECKPOINT_INTERVAL_MINUTES: u32 = 24 * 60;
const MAX_VERSIONS_PER_FILE: usize = 512;
const MAX_TOTAL_BACKUP_FILES: usize = 100_000;
const MAX_TOTAL_BACKUP_SIZE_MB: u64 = 1_048_576;
const MAX_AUTOMATIC_RETENTION_DAYS: u32 = 3_650;
const MIN_ORPHAN_RETENTION_DAYS: u32 = 7;
const MAX_ORPHAN_RETENTION_DAYS: u32 = 3_650;
const MAX_WORKSPACE_FILES: usize = 800;
const SUPPORTED_MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkdn", "mdwn", "txt"];
const LINUX_DESKTOP_ENTRY: &str = "dev.nyamarkdownor.app.desktop";
const FILE_CHANGED_DURING_SAVE_ERROR: &str = "File changed on disk before save.";
const DEFAULT_UPDATE_REPOSITORY: &str = "stevennight/NyaMarkdownor";
#[cfg(windows)]
const CP_GBK: u32 = 936;
#[cfg(windows)]
const CP_GB18030: u32 = 54936;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    name: String,
    version: String,
    commit: String,
    build_date: String,
    update_repository: String,
}

fn application_version() -> &'static str {
    option_env!("NYAMARKDOWNOR_VERSION").unwrap_or(concat!(env!("CARGO_PKG_VERSION"), "-dev"))
}

fn build_info() -> BuildInfo {
    BuildInfo {
        name: "NyaMarkdownor".to_string(),
        version: application_version().to_string(),
        commit: option_env!("NYAMARKDOWNOR_COMMIT")
            .unwrap_or_default()
            .to_string(),
        build_date: option_env!("NYAMARKDOWNOR_BUILD_DATE")
            .unwrap_or_default()
            .to_string(),
        update_repository: option_env!("NYAMARKDOWNOR_UPDATE_REPOSITORY")
            .unwrap_or(DEFAULT_UPDATE_REPOSITORY)
            .to_string(),
    }
}

pub fn version_output() -> String {
    let info = build_info();
    let mut parts = vec![format!("{} v{}", info.name, info.version)];

    if !info.commit.is_empty() {
        parts.push(format!("commit={}", info.commit));
    }
    if !info.build_date.is_empty() {
        parts.push(format!("built={}", info.build_date));
    }
    if !info.update_repository.is_empty() {
        parts.push(format!("updates={}", info.update_repository));
    }

    parts.join(" ")
}

#[tauri::command]
fn get_build_info() -> BuildInfo {
    build_info()
}

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
enum RequestedBackupKind {
    Automatic,
    Manual,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum BackupKind {
    Previous,
    Automatic,
    Manual,
}

impl BackupKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Previous => "previous",
            Self::Automatic => "automatic",
            Self::Manual => "manual",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "previous" => Some(Self::Previous),
            "automatic" => Some(Self::Automatic),
            "manual" => Some(Self::Manual),
            _ => None,
        }
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    name: String,
    modified_ms: u64,
    size: u64,
    kind: Option<BackupKind>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSettingsInput {
    directory: Option<String>,
    previous_directories: Vec<String>,
    checkpoint_interval_minutes: u32,
    automatic_versions_per_file: usize,
    manual_versions_per_file: usize,
    max_total_files: usize,
    max_total_size_mb: u64,
    max_backup_file_size_mb: u64,
    automatic_retention_days: u32,
    #[serde(default = "default_orphan_retention_days")]
    orphan_retention_days: u32,
}

fn default_orphan_retention_days() -> u32 {
    365
}

impl Default for BackupSettingsInput {
    fn default() -> Self {
        Self {
            directory: None,
            previous_directories: Vec::new(),
            checkpoint_interval_minutes: 10,
            automatic_versions_per_file: 48,
            manual_versions_per_file: 32,
            max_total_files: 2_048,
            max_total_size_mb: 2_048,
            max_backup_file_size_mb: 256,
            automatic_retention_days: 180,
            orphan_retention_days: default_orphan_retention_days(),
        }
    }
}

#[derive(Clone, Debug)]
struct BackupSettings {
    directory: Option<PathBuf>,
    previous_directories: Vec<PathBuf>,
    checkpoint_interval: Duration,
    automatic_versions_per_file: usize,
    manual_versions_per_file: usize,
    max_total_files: usize,
    max_total_bytes: u64,
    max_backup_file_bytes: u64,
    automatic_retention: Duration,
    orphan_retention: Duration,
}

#[derive(Default)]
struct BackupOperationLock(Mutex<()>);

#[derive(Clone, Debug)]
struct CentralBackupFile {
    path: PathBuf,
    created_ns: u128,
    size: u64,
    kind: BackupKind,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupSourceMetadata {
    source_path: String,
    file_name: String,
    last_seen_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    orphaned_since_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SourcePathState {
    Present,
    Missing,
    Unavailable,
}

impl SourcePathState {
    fn source_exists_for_listing(self) -> bool {
        self != Self::Missing
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupHistoryEntry {
    source_path: String,
    file_name: String,
    latest_ms: u64,
    backup_count: usize,
    total_size: u64,
    source_exists: bool,
    latest_backup_path: Option<String>,
}

struct BackupRoots {
    active: PathBuf,
    readable: Vec<PathBuf>,
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
async fn pick_markdown_backup_directory(app: AppHandle) -> Result<Option<String>, String> {
    run_file_dialog(move || {
        app.dialog()
            .file()
            .set_title("Choose Backup Folder")
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
    app: AppHandle,
    backup_lock: State<'_, BackupOperationLock>,
    path: String,
    content: String,
    expected_stats: Option<FileStats>,
    expected_missing: bool,
    backup_kind: RequestedBackupKind,
    backup_settings: Option<BackupSettingsInput>,
) -> Result<WriteResult, String> {
    let backup_settings = validate_backup_settings(backup_settings.unwrap_or_default())?;
    let path = validate_markdown_path(path)?;
    let _backup_guard = lock_backup_operations(&backup_lock)?;
    let backup_roots = backup_roots_for_app(&app, &backup_settings, true)?;
    if expected_missing {
        verify_expected_file_missing(&path)?;
    } else if let Some(expected_stats) = expected_stats {
        verify_expected_file_stats(&path, expected_stats)?;
    }
    let source_stats_before_backup = source_stats_before_backup(&path, expected_missing)?;
    let backup_path = backup_existing_file(&backup_roots, &path, backup_kind, &backup_settings)
        .map_err(|error| format!("Failed to create backup: {error}"))?;
    verify_source_state_after_backup(&path, source_stats_before_backup)?;
    atomic_write_checked(&path, content.as_bytes(), source_stats_before_backup)
        .map_err(|error| format!("Failed to write file: {error}"))?;
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
fn list_markdown_backups(
    app: AppHandle,
    backup_lock: State<'_, BackupOperationLock>,
    path: String,
    backup_settings: Option<BackupSettingsInput>,
) -> Result<Vec<BackupEntry>, String> {
    let backup_settings = validate_backup_settings(backup_settings.unwrap_or_default())?;
    let source_path = validate_markdown_path(path)?;
    let _backup_guard = lock_backup_operations(&backup_lock)?;
    let backup_roots = backup_roots_for_app(&app, &backup_settings, true)?;
    list_backups_for_source(&backup_roots, &source_path)
        .map_err(|error| format!("Failed to read backups: {error}"))
}

#[tauri::command]
fn list_markdown_backup_histories(
    app: AppHandle,
    backup_lock: State<'_, BackupOperationLock>,
    backup_settings: Option<BackupSettingsInput>,
) -> Result<Vec<BackupHistoryEntry>, String> {
    let backup_settings = validate_backup_settings(backup_settings.unwrap_or_default())?;
    let _backup_guard = lock_backup_operations(&backup_lock)?;
    let backup_roots = backup_roots_for_app(&app, &backup_settings, true)?;
    maintain_orphaned_backup_histories(
        &backup_roots,
        modified_ms(SystemTime::now()),
        &backup_settings,
    )
    .map_err(|error| format!("Failed to maintain backup histories: {error}"))?;
    list_backup_histories_in_roots(&backup_roots)
        .map_err(|error| format!("Failed to read backup histories: {error}"))
}

#[tauri::command]
fn delete_markdown_backup_history(
    app: AppHandle,
    backup_lock: State<'_, BackupOperationLock>,
    source_path: String,
    backup_settings: Option<BackupSettingsInput>,
) -> Result<(), String> {
    let backup_settings = validate_backup_settings(backup_settings.unwrap_or_default())?;
    let source_path = validate_markdown_path(source_path)?;
    let _backup_guard = lock_backup_operations(&backup_lock)?;
    let backup_roots = backup_roots_for_app(&app, &backup_settings, true)?;
    delete_backup_history_in_roots(&backup_roots, &source_path)
        .map_err(|error| format!("Failed to delete backup history: {error}"))
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
fn read_markdown_backup(
    app: AppHandle,
    backup_lock: State<'_, BackupOperationLock>,
    source_path: String,
    backup_path: String,
    backup_settings: Option<BackupSettingsInput>,
) -> Result<String, String> {
    let backup_settings = validate_backup_settings(backup_settings.unwrap_or_default())?;
    let source_path = validate_markdown_path(source_path)?;
    let _backup_guard = lock_backup_operations(&backup_lock)?;
    let backup_roots = backup_roots_for_app(&app, &backup_settings, true)?;
    let backup_path = validate_backup_path(&backup_roots, &source_path, backup_path)?;

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

fn validate_backup_settings(input: BackupSettingsInput) -> Result<BackupSettings, String> {
    if !(1..=MAX_CHECKPOINT_INTERVAL_MINUTES).contains(&input.checkpoint_interval_minutes) {
        return Err(format!(
            "Backup checkpoint interval must be between 1 and {MAX_CHECKPOINT_INTERVAL_MINUTES} minutes."
        ));
    }
    if !(1..=MAX_VERSIONS_PER_FILE).contains(&input.automatic_versions_per_file) {
        return Err(format!(
            "Automatic backup versions must be between 1 and {MAX_VERSIONS_PER_FILE}."
        ));
    }
    if !(1..=MAX_VERSIONS_PER_FILE).contains(&input.manual_versions_per_file) {
        return Err(format!(
            "Manual backup versions must be between 1 and {MAX_VERSIONS_PER_FILE}."
        ));
    }
    if !(1..=MAX_TOTAL_BACKUP_FILES).contains(&input.max_total_files) {
        return Err(format!(
            "Total backup files must be between 1 and {MAX_TOTAL_BACKUP_FILES}."
        ));
    }
    if !(1..=MAX_TOTAL_BACKUP_SIZE_MB).contains(&input.max_total_size_mb) {
        return Err(format!(
            "Total backup size must be between 1 and {MAX_TOTAL_BACKUP_SIZE_MB} MiB."
        ));
    }
    if !(1..=MAX_TOTAL_BACKUP_SIZE_MB).contains(&input.max_backup_file_size_mb) {
        return Err(format!(
            "Maximum backup file size must be between 1 and {MAX_TOTAL_BACKUP_SIZE_MB} MiB."
        ));
    }
    if !(1..=MAX_AUTOMATIC_RETENTION_DAYS).contains(&input.automatic_retention_days) {
        return Err(format!(
            "Automatic backup retention must be between 1 and {MAX_AUTOMATIC_RETENTION_DAYS} days."
        ));
    }
    if !(MIN_ORPHAN_RETENTION_DAYS..=MAX_ORPHAN_RETENTION_DAYS)
        .contains(&input.orphan_retention_days)
    {
        return Err(format!(
            "Orphaned backup retention must be between {MIN_ORPHAN_RETENTION_DAYS} and {MAX_ORPHAN_RETENTION_DAYS} days."
        ));
    }
    if input.previous_directories.len() > MAX_PREVIOUS_DIRECTORIES {
        return Err(format!(
            "At most {MAX_PREVIOUS_DIRECTORIES} previous backup directories are supported."
        ));
    }

    let directory = input
        .directory
        .as_deref()
        .map(validate_backup_base_directory)
        .transpose()?;
    let mut seen_previous = HashSet::new();
    let mut previous_directories = Vec::new();
    for value in &input.previous_directories {
        let directory = validate_backup_base_directory(value)?;
        let key = local_path_key(&directory.to_string_lossy());
        if seen_previous.insert(key) {
            previous_directories.push(directory);
        }
    }

    Ok(BackupSettings {
        directory,
        previous_directories,
        checkpoint_interval: Duration::from_secs(u64::from(input.checkpoint_interval_minutes) * 60),
        automatic_versions_per_file: input.automatic_versions_per_file,
        manual_versions_per_file: input.manual_versions_per_file,
        max_total_files: input.max_total_files,
        max_total_bytes: input.max_total_size_mb * MIB,
        max_backup_file_bytes: input
            .max_backup_file_size_mb
            .min(input.max_total_size_mb)
            * MIB,
        automatic_retention: Duration::from_secs(u64::from(input.automatic_retention_days) * 24 * 60 * 60),
        orphan_retention: Duration::from_secs(u64::from(input.orphan_retention_days) * 24 * 60 * 60),
    })
}

fn validate_backup_base_directory(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() {
        return Err("Backup directory cannot be empty.".to_string());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("Backup directory must be an absolute path.".to_string());
    }
    Ok(path)
}

fn default_backup_root_for_app(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join(CENTRAL_BACKUP_DIR_NAME))
        .map_err(|error| format!("Failed to locate local app data folder: {error}"))
}

fn configured_backup_root(directory: &Path) -> PathBuf {
    directory
        .join(CUSTOM_BACKUP_CONTAINER_NAME)
        .join(CENTRAL_BACKUP_DIR_NAME)
}

fn backup_roots_for_app(
    app: &AppHandle,
    settings: &BackupSettings,
    prepare_active: bool,
) -> Result<BackupRoots, String> {
    let default_root = default_backup_root_for_app(app)?;
    backup_roots_from_default(default_root, settings, prepare_active)
}

fn backup_roots_from_default(
    default_root: PathBuf,
    settings: &BackupSettings,
    prepare_active: bool,
) -> Result<BackupRoots, String> {
    let active = settings
        .directory
        .as_deref()
        .map(configured_backup_root)
        .unwrap_or_else(|| default_root.clone());
    if prepare_active {
        fs::create_dir_all(&active)
            .map_err(|error| format!("Failed to prepare active backup folder: {error}"))?;
        if !active.is_dir() {
            return Err("Active backup path is not a folder.".to_string());
        }
    }

    let mut readable = Vec::new();
    let mut seen = HashSet::new();
    for root in std::iter::once(active.clone())
        .chain(std::iter::once(default_root))
        .chain(settings.previous_directories.iter().map(|directory| configured_backup_root(directory)))
    {
        let key = backup_root_identity(&root);
        if seen.insert(key) {
            readable.push(root);
        }
    }

    Ok(BackupRoots { active, readable })
}

fn backup_root_identity(root: &Path) -> String {
    let physical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    local_path_key(&physical.to_string_lossy())
}

fn lock_backup_operations<'a>(
    backup_lock: &'a State<'_, BackupOperationLock>,
) -> Result<MutexGuard<'a, ()>, String> {
    backup_lock
        .0
        .lock()
        .map_err(|_| "Backup operations are unavailable.".to_string())
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

fn source_stats_before_backup(path: &Path, expected_missing: bool) -> Result<Option<FileStats>, String> {
    match file_stats_for(path) {
        Ok(_) if expected_missing => Err(FILE_CHANGED_DURING_SAVE_ERROR.to_string()),
        Ok(stats) => Ok(Some(stats)),
        Err(error) if error.kind() == io::ErrorKind::NotFound && expected_missing => Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Err(FILE_CHANGED_DURING_SAVE_ERROR.to_string())
        }
        Err(error) => Err(format!("Failed to inspect file before backup: {error}")),
    }
}

fn verify_source_state_after_backup(
    path: &Path,
    source_stats_before_backup: Option<FileStats>,
) -> Result<(), String> {
    match source_stats_before_backup {
        Some(stats) => verify_expected_file_stats(path, stats),
        None => verify_expected_file_missing(path),
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

fn list_backups_for_source(backup_roots: &BackupRoots, source_path: &Path) -> io::Result<Vec<BackupEntry>> {
    let mut backups = Vec::new();
    for backup_root in &backup_roots.readable {
        if let Err(error) = append_central_backup_entries(backup_root, source_path, &mut backups) {
            if backup_root == &backup_roots.active {
                return Err(error);
            }
        }
    }
    let _ = append_legacy_backup_entries(source_path, &mut backups);
    backups.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then_with(|| right.path.cmp(&left.path))
    });
    Ok(backups)
}

fn append_central_backup_entries(
    backup_root: &Path,
    source_path: &Path,
    backups: &mut Vec<BackupEntry>,
) -> io::Result<()> {
    let backup_dir = central_backup_dir_for_source(backup_root, source_path);
    let Some(backup_dir) = safe_existing_backup_bucket(backup_root, &backup_dir)? else {
        return Ok(());
    };

    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some((kind, created_ns)) = parse_central_backup_name(source_path, name) else {
            continue;
        };
        let metadata = entry.metadata()?;
        backups.push(BackupEntry {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            modified_ms: nanoseconds_to_milliseconds(created_ns),
            size: metadata.len(),
            kind: Some(kind),
        });
    }

    Ok(())
}

fn append_legacy_backup_entries(source_path: &Path, backups: &mut Vec<BackupEntry>) -> io::Result<()> {
    let backup_dir = legacy_backup_dir_for_source(source_path);
    if !backup_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_legacy_backup_name(source_path, name) {
            continue;
        }
        let metadata = entry.metadata()?;
        backups.push(BackupEntry {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            modified_ms: modified_ms(metadata.modified().unwrap_or(UNIX_EPOCH)),
            size: metadata.len(),
            kind: None,
        });
    }

    Ok(())
}

fn list_backup_histories_in_roots(backup_roots: &BackupRoots) -> io::Result<Vec<BackupHistoryEntry>> {
    let mut histories = HashMap::<String, BackupHistoryEntry>::new();
    for backup_root in &backup_roots.readable {
        if let Err(error) = append_backup_histories(backup_root, &mut histories) {
            if backup_root == &backup_roots.active {
                return Err(error);
            }
        }
    }

    let mut histories = histories.into_values().collect::<Vec<_>>();
    histories.sort_by(|left, right| {
        right
            .latest_ms
            .cmp(&left.latest_ms)
            .then_with(|| left.source_path.cmp(&right.source_path))
    });
    Ok(histories)
}

fn append_backup_histories(
    backup_root: &Path,
    histories: &mut HashMap<String, BackupHistoryEntry>,
) -> io::Result<()> {
    append_backup_histories_with_probe(backup_root, histories, &mut |path| fs::metadata(path))
}

fn append_backup_histories_with_probe<F>(
    backup_root: &Path,
    histories: &mut HashMap<String, BackupHistoryEntry>,
    source_probe: &mut F,
) -> io::Result<()>
where
    F: FnMut(&Path) -> io::Result<fs::Metadata>,
{
    if !backup_root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !is_backup_bucket_name(&entry.file_name()) {
            continue;
        }
        let bucket_dir = entry.path();
        if validate_existing_backup_bucket(backup_root, &bucket_dir).is_err() {
            continue;
        }
        let Ok(metadata) = read_source_metadata(&bucket_dir) else {
            continue;
        };
        let source_path = PathBuf::from(&metadata.source_path);
        if entry.file_name().to_string_lossy() != source_backup_key(&source_path) {
            continue;
        }
        let backups = scan_central_backups_for_source(&bucket_dir, &source_path)?;
        let Some(latest) = backups.iter().max_by_key(|backup| backup.created_ns) else {
            continue;
        };
        let key = local_path_key(&metadata.source_path);
        let candidate_source_exists = source_path_state_with_probe(&source_path, &mut *source_probe)
            .source_exists_for_listing();
        let history = histories.entry(key).or_insert_with(|| BackupHistoryEntry {
            source_path: metadata.source_path.clone(),
            file_name: metadata.file_name.clone(),
            latest_ms: 0,
            backup_count: 0,
            total_size: 0,
            source_exists: candidate_source_exists,
            latest_backup_path: None,
        });
        history.source_exists |= candidate_source_exists;
        history.backup_count = history.backup_count.saturating_add(backups.len());
        history.total_size = history
            .total_size
            .saturating_add(backups.iter().fold(0u64, |total, backup| total.saturating_add(backup.size)));
        let _last_seen_ms = metadata.last_seen_ms;
        let latest_ms = nanoseconds_to_milliseconds(latest.created_ns);
        if latest_ms >= history.latest_ms {
            history.latest_ms = latest_ms;
            history.latest_backup_path = Some(latest.path.to_string_lossy().to_string());
            history.source_path = metadata.source_path.clone();
            history.file_name = metadata.file_name.clone();
        }
    }
    Ok(())
}

fn validate_backup_path(
    backup_roots: &BackupRoots,
    source_path: &Path,
    backup_path: String,
) -> Result<PathBuf, String> {
    let backup_path = PathBuf::from(backup_path);
    if backup_path.is_dir() {
        return Err("Cannot open a directory as a backup file.".to_string());
    }

    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|_| "Backup file does not exist.".to_string())?;
    let legacy_dir = legacy_backup_dir_for_source(source_path);
    let in_central_dir = backup_roots.readable.iter().any(|backup_root| {
        let backup_dir = central_backup_dir_for_source(backup_root, source_path);
        safe_existing_backup_bucket(backup_root, &backup_dir)
            .ok()
            .flatten()
            .is_some_and(|directory| canonical_directory_contains(&directory, &canonical_backup))
    });
    let in_legacy_dir = canonical_directory_contains(&legacy_dir, &canonical_backup);
    if !in_central_dir && !in_legacy_dir {
        return Err("Backup is outside the current file backup folder.".to_string());
    }

    let Some(name) = canonical_backup.file_name().and_then(|value| value.to_str()) else {
        return Err("Backup file has no name.".to_string());
    };
    let valid_name = (in_central_dir && parse_central_backup_name(source_path, name).is_some())
        || (in_legacy_dir && is_legacy_backup_name(source_path, name));
    if !valid_name {
        return Err("Backup does not belong to the current file.".to_string());
    }

    Ok(canonical_backup)
}

fn canonical_directory_contains(directory: &Path, candidate: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(directory) else {
        return false;
    };
    if !metadata.file_type().is_dir() {
        return false;
    }

    directory
        .canonicalize()
        .map(|directory| candidate.starts_with(directory))
        .unwrap_or(false)
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

fn atomic_write_checked(
    path: &Path,
    content: &[u8],
    expected_source_stats: Option<FileStats>,
) -> std::io::Result<()> {
    atomic_write_checked_with_hook(
        path,
        content,
        expected_source_stats,
        |_, _| Ok(()),
    )
}

fn atomic_write_checked_with_hook<F>(
    path: &Path,
    content: &[u8],
    expected_source_stats: Option<FileStats>,
    after_staging: F,
) -> std::io::Result<()>
where
    F: FnOnce(&Path, Option<&Path>) -> std::io::Result<()>,
{
    atomic_write_checked_with_ops(
        path,
        content,
        expected_source_stats,
        after_staging,
        |source, destination| fs::hard_link(source, destination),
    )
}

fn atomic_write_checked_with_ops<F, H>(
    path: &Path,
    content: &[u8],
    expected_source_stats: Option<FileStats>,
    after_staging: F,
    hard_link: H,
) -> std::io::Result<()>
where
    F: FnOnce(&Path, Option<&Path>) -> std::io::Result<()>,
    H: Fn(&Path, &Path) -> std::io::Result<()>,
{
    let parent = ensure_writable_parent(path)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.md");
    let stage = create_checked_write_stage(parent, file_name, content)?;

    match expected_source_stats {
        None => {
            let result = after_staging(&stage.temp_path, None)
                .and_then(|_| publish_staged_file_no_clobber(&stage.temp_path, path, &hard_link));
            cleanup_checked_write_stage(&stage, false);
            if result.is_ok() {
                sync_parent_directory(parent);
            }
            result
        }
        Some(expected_stats) => {
            if let Err(error) = probe_checked_hard_link_support(&stage, &hard_link) {
                cleanup_checked_write_stage(&stage, false);
                return Err(error);
            }
            match path_entry_exists(&stage.rollback_path) {
                Ok(false) => {}
                Ok(true) => {
                    cleanup_checked_write_stage(&stage, false);
                    return Err(io::Error::new(
                        io::ErrorKind::AlreadyExists,
                        "Checked-write rollback path is unexpectedly occupied.",
                    ));
                }
                Err(error) => {
                    cleanup_checked_write_stage(&stage, false);
                    return Err(error);
                }
            }
            if let Err(error) = fs::rename(path, &stage.rollback_path) {
                cleanup_checked_write_stage(&stage, false);
                return if error.kind() == io::ErrorKind::NotFound {
                    Err(file_changed_during_checked_write())
                } else {
                    Err(error)
                };
            }

            let result = (|| {
                after_staging(&stage.temp_path, Some(&stage.rollback_path))?;
                verify_expected_file_stats(&stage.rollback_path, expected_stats)
                    .map_err(|_| file_changed_during_checked_write())?;
                preserve_existing_file_permissions(&stage.rollback_path, &stage.temp_path)?;
                publish_staged_file_no_clobber(&stage.temp_path, path, &hard_link)
            })();

            match result {
                Ok(()) => {
                    cleanup_checked_write_stage(&stage, true);
                    sync_parent_directory(parent);
                    Ok(())
                }
                Err(error) => {
                    let restore = restore_rollback_no_clobber(
                        &stage.rollback_path,
                        path,
                        &hard_link,
                    );
                    let (error, retain_rollback) = checked_write_failure(
                        error,
                        restore,
                        &stage.rollback_path,
                    );
                    cleanup_checked_write_stage(&stage, !retain_rollback);
                    Err(error)
                }
            }
        }
    }
}

struct CheckedWriteStage {
    directory: PathBuf,
    temp_path: PathBuf,
    rollback_path: PathBuf,
    probe_path: PathBuf,
}

fn create_checked_write_stage(
    parent: &Path,
    file_name: &str,
    content: &[u8],
) -> std::io::Result<CheckedWriteStage> {
    let mut nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    loop {
        let directory = parent.join(format!(".{file_name}.{nonce}.checked-write"));
        match fs::create_dir(&directory) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                nonce = nonce.checked_add(1).ok_or_else(|| {
                    io::Error::new(io::ErrorKind::AlreadyExists, "Temporary filename space is exhausted.")
                })?;
                continue;
            }
            Err(error) => return Err(error),
        }
        if let Err(error) = make_checked_write_directory_private(&directory) {
            let _ = fs::remove_dir(&directory);
            return Err(error);
        }

        let temp_path = directory.join("staged.tmp");
        let rollback_path = directory.join("rollback");
        let probe_path = directory.join("hard-link.probe");
        let mut temp_file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => file,
            Err(error) => {
                let _ = fs::remove_dir(&directory);
                return Err(error);
            }
        };
        let write_result = temp_file
            .write_all(content)
            .and_then(|_| temp_file.sync_all());
        drop(temp_file);
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp_path);
            let _ = fs::remove_dir(&directory);
            return Err(error);
        }
        return Ok(CheckedWriteStage {
            directory,
            temp_path,
            rollback_path,
            probe_path,
        });
    }
}

fn probe_checked_hard_link_support<H>(
    stage: &CheckedWriteStage,
    hard_link: &H,
) -> std::io::Result<()>
where
    H: Fn(&Path, &Path) -> std::io::Result<()>,
{
    hard_link(&stage.temp_path, &stage.probe_path)?;
    fs::remove_file(&stage.probe_path)
}

fn publish_staged_file_no_clobber<H>(
    temp_path: &Path,
    path: &Path,
    hard_link: &H,
) -> std::io::Result<()>
where
    H: Fn(&Path, &Path) -> std::io::Result<()>,
{
    match hard_link(temp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => match fs::symlink_metadata(path) {
            Ok(_) => Err(file_changed_during_checked_write()),
            Err(inspect_error) if inspect_error.kind() == io::ErrorKind::NotFound => Err(error),
            Err(inspect_error) => Err(inspect_error),
        },
    }
}

enum RollbackRestore {
    Restored,
    DestinationOccupied,
    Failed(io::Error),
}

fn restore_rollback_no_clobber<H>(
    rollback_path: &Path,
    path: &Path,
    hard_link: &H,
) -> RollbackRestore
where
    H: Fn(&Path, &Path) -> std::io::Result<()>,
{
    match hard_link(rollback_path, path) {
        Ok(()) => {
            let _ = fs::remove_file(rollback_path);
            if let Some(parent) = path.parent() {
                sync_parent_directory(parent);
            }
            RollbackRestore::Restored
        }
        Err(error) => match fs::symlink_metadata(path) {
            Ok(_) => RollbackRestore::DestinationOccupied,
            Err(inspect_error) if inspect_error.kind() == io::ErrorKind::NotFound => {
                RollbackRestore::Failed(error)
            }
            Err(inspect_error) => RollbackRestore::Failed(inspect_error),
        },
    }
}

fn checked_write_failure(
    error: io::Error,
    restore: RollbackRestore,
    rollback_path: &Path,
) -> (io::Error, bool) {
    match restore {
        RollbackRestore::Restored => (error, false),
        RollbackRestore::DestinationOccupied => {
            let kind = error.kind();
            (
                io::Error::new(
                    kind,
                    format!(
                        "{error} The destination was changed externally; the original file is preserved at '{}'.",
                        rollback_path.display()
                    ),
                ),
                true,
            )
        }
        RollbackRestore::Failed(restore_error) => {
            let kind = error.kind();
            (
                io::Error::new(
                    kind,
                    format!(
                        "{error} Failed to restore the original file ({restore_error}); it is preserved at '{}'.",
                        rollback_path.display()
                    ),
                ),
                true,
            )
        }
    }
}

fn cleanup_checked_write_stage(stage: &CheckedWriteStage, remove_rollback: bool) {
    let _ = fs::remove_file(&stage.probe_path);
    let _ = fs::remove_file(&stage.temp_path);
    if remove_rollback {
        let _ = fs::remove_file(&stage.rollback_path);
    }
    let _ = fs::remove_dir(&stage.directory);
}

fn file_changed_during_checked_write() -> io::Error {
    io::Error::new(io::ErrorKind::Other, FILE_CHANGED_DURING_SAVE_ERROR)
}

fn path_entry_exists(path: &Path) -> std::io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(unix)]
fn make_checked_write_directory_private(directory: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn make_checked_write_directory_private(_directory: &Path) -> std::io::Result<()> {
    Ok(())
}

fn sync_parent_directory(parent: &Path) {
    let _ = fs::File::open(parent).and_then(|directory| directory.sync_all());
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

fn backup_existing_file(
    backup_roots: &BackupRoots,
    path: &Path,
    requested_kind: RequestedBackupKind,
    settings: &BackupSettings,
) -> io::Result<Option<PathBuf>> {
    backup_existing_file_at(backup_roots, path, requested_kind, SystemTime::now(), settings)
}

fn backup_existing_file_at(
    backup_roots: &BackupRoots,
    path: &Path,
    requested_kind: RequestedBackupKind,
    now: SystemTime,
    settings: &BackupSettings,
) -> io::Result<Option<PathBuf>> {
    backup_existing_file_at_with_metadata_writer(
        backup_roots,
        path,
        requested_kind,
        now,
        settings,
        |backup_dir, source_path, now| write_source_metadata(backup_dir, source_path, now),
    )
}

fn backup_existing_file_at_with_metadata_writer<F>(
    backup_roots: &BackupRoots,
    path: &Path,
    requested_kind: RequestedBackupKind,
    now: SystemTime,
    settings: &BackupSettings,
    write_metadata: F,
) -> io::Result<Option<PathBuf>>
where
    F: FnOnce(&Path, &Path, SystemTime) -> io::Result<()>,
{
    if !path.exists() {
        return Ok(None);
    }

    let source_metadata = fs::metadata(path)?;
    ensure_backup_file_size_allowed(source_metadata.len(), settings)?;
    let expected_stats = file_stats_for(path)?;
    ensure_backup_file_size_allowed(expected_stats.size, settings)?;
    let allow_manual_eviction = requested_kind == RequestedBackupKind::Manual;
    let backup_dir = central_backup_dir_for_source(&backup_roots.active, path);
    let _ = safe_existing_backup_bucket(&backup_roots.active, &backup_dir)?;
    cleanup_partial_backup_files_in_roots(backup_roots)?;
    enforce_global_backup_limits(
        backup_roots,
        1,
        expected_stats.size,
        None,
        allow_manual_eviction,
        settings,
    )?;

    let now_ns = system_time_nanoseconds(now);
    prepare_safe_backup_bucket(&backup_roots.active, &backup_dir)?;
    let existing = scan_central_backups_for_source(&backup_dir, path)?;
    let kind = match requested_kind {
        RequestedBackupKind::Manual => BackupKind::Manual,
        RequestedBackupKind::Automatic => {
            let latest_checkpoint = existing
                .iter()
                .filter(|backup| backup.kind == BackupKind::Automatic)
                .max_by_key(|backup| backup.created_ns);
            if latest_checkpoint.is_some_and(|backup| {
                now_ns.saturating_sub(backup.created_ns) < settings.checkpoint_interval.as_nanos()
            }) {
                BackupKind::Previous
            } else {
                BackupKind::Automatic
            }
        }
    };

    let (backup_path, created_ns) = create_central_backup(
        &backup_dir,
        path,
        kind,
        now,
        expected_stats,
    )?;
    if let Err(error) = write_metadata(&backup_dir, path, now) {
        let _ = fs::remove_file(&backup_path);
        if validate_existing_backup_bucket(&backup_roots.active, &backup_dir).is_ok() {
            let _ = remove_validated_backup_bucket_if_empty(&backup_dir);
        }
        return Err(error);
    }
    if kind != BackupKind::Previous {
        match scan_central_backup_dir(&backup_dir) {
            Ok(backups) => {
                let previous = backups
                    .into_iter()
                    .filter(|backup| backup.kind == BackupKind::Previous)
                    .collect::<Vec<_>>();
                if let Err(error) = remove_oldest_excess(previous, 0, Some(&backup_path)) {
                    eprintln!("Failed to retire the previous rolling backup: {error}");
                }
            }
            Err(error) => eprintln!("Failed to inspect rolling backups: {error}"),
        }
    }
    if let Err(error) = cleanup_central_backups(
        backup_roots,
        path,
        Some(&backup_path),
        created_ns,
        allow_manual_eviction,
        settings,
    ) {
        eprintln!("Failed to clean old backups: {error}");
    }
    Ok(Some(backup_path))
}

fn ensure_backup_file_size_allowed(size: u64, settings: &BackupSettings) -> io::Result<()> {
    if size <= settings.max_backup_file_bytes {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        format!(
            "File is {} MiB, exceeding the configured maximum backup file size of {} MiB; save canceled to avoid overwriting without a recovery copy.",
            size.div_ceil(MIB),
            settings.max_backup_file_bytes / MIB
        ),
    ))
}

fn create_central_backup(
    backup_dir: &Path,
    source_path: &Path,
    kind: BackupKind,
    now: SystemTime,
    expected_stats: FileStats,
) -> io::Result<(PathBuf, u128)> {
    let mut nonce = system_time_nanoseconds(now);
    loop {
        let backup_path = backup_dir.join(format!(
            "{}{}.{nonce}.bak",
            backup_prefix_for_source(source_path),
            kind.as_str()
        ));
        if backup_path.exists() {
            nonce = nonce.checked_add(1).ok_or_else(|| {
                io::Error::new(io::ErrorKind::AlreadyExists, "Backup timestamp space is exhausted.")
            })?;
            continue;
        }
        let partial_path = backup_dir.join(format!(
            ".{}.partial",
            backup_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("backup")
        ));
        let mut destination = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&partial_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                nonce = nonce.checked_add(1).ok_or_else(|| {
                    io::Error::new(io::ErrorKind::AlreadyExists, "Backup timestamp space is exhausted.")
                })?;
                continue;
            }
            Err(error) => return Err(error),
        };

        let copy_result = (|| -> io::Result<()> {
            let mut source = fs::File::open(source_path)?;
            io::copy(&mut source, &mut destination)?;
            destination.sync_all()
        })();
        if let Err(error) = copy_result {
            drop(destination);
            let _ = fs::remove_file(&partial_path);
            return Err(error);
        }

        if let Err(error) = verify_expected_file_stats(source_path, expected_stats) {
            drop(destination);
            let _ = fs::remove_file(&partial_path);
            return Err(io::Error::new(io::ErrorKind::Other, error));
        }
        drop(destination);
        if let Err(error) = fs::rename(&partial_path, &backup_path) {
            let _ = fs::remove_file(&partial_path);
            return Err(error);
        }
        let _ = fs::File::open(backup_dir).and_then(|directory| directory.sync_all());
        return Ok((backup_path, nonce));
    }
}

fn write_source_metadata(backup_dir: &Path, source_path: &Path, now: SystemTime) -> io::Result<()> {
    let metadata = BackupSourceMetadata {
        source_path: source_path.to_string_lossy().to_string(),
        file_name: source_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("document.md")
            .to_string(),
        last_seen_ms: modified_ms(now),
        orphaned_since_ms: None,
    };
    write_source_metadata_record(backup_dir, &metadata)
}

fn write_source_metadata_record(
    backup_dir: &Path,
    metadata: &BackupSourceMetadata,
) -> io::Result<()> {
    let content = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    atomic_write(&backup_dir.join(SOURCE_METADATA_FILE_NAME), &content)
}

fn read_source_metadata(backup_dir: &Path) -> io::Result<BackupSourceMetadata> {
    let content = fs::read(backup_dir.join(SOURCE_METADATA_FILE_NAME))?;
    serde_json::from_slice(&content)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn source_path_state_with_probe<F>(source_path: &Path, mut probe: F) -> SourcePathState
where
    F: FnMut(&Path) -> io::Result<fs::Metadata>,
{
    match probe(source_path) {
        Ok(metadata) if metadata.is_file() => return SourcePathState::Present,
        Ok(_) => return SourcePathState::Missing,
        Err(error) if error.kind() != io::ErrorKind::NotFound => {
            return SourcePathState::Unavailable;
        }
        Err(_) => {}
    }

    let mut ancestor = source_path.parent();
    while let Some(path) = ancestor {
        match probe(path) {
            Ok(_) => return SourcePathState::Missing,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                ancestor = path.parent();
            }
            Err(_) => return SourcePathState::Unavailable,
        }
    }
    SourcePathState::Unavailable
}

fn maintain_orphaned_backup_histories(
    backup_roots: &BackupRoots,
    now_ms: u64,
    settings: &BackupSettings,
) -> io::Result<()> {
    for backup_root in &backup_roots.readable {
        if let Err(error) = maintain_orphaned_backup_histories_in_root(
            backup_root,
            now_ms,
            settings.orphan_retention,
        ) {
            if backup_root == &backup_roots.active {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn maintain_orphaned_backup_histories_in_root(
    backup_root: &Path,
    now_ms: u64,
    orphan_retention: Duration,
) -> io::Result<()> {
    maintain_orphaned_backup_histories_in_root_with_probe(
        backup_root,
        now_ms,
        orphan_retention,
        |path| fs::metadata(path),
    )
}

fn maintain_orphaned_backup_histories_in_root_with_probe<F>(
    backup_root: &Path,
    now_ms: u64,
    orphan_retention: Duration,
    mut source_probe: F,
) -> io::Result<()>
where
    F: FnMut(&Path) -> io::Result<fs::Metadata>,
{
    if !backup_root.exists() {
        return Ok(());
    }

    let retention_ms = orphan_retention
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    for entry in fs::read_dir(backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !is_backup_bucket_name(&entry.file_name()) {
            continue;
        }
        let bucket_dir = entry.path();
        if validate_existing_backup_bucket(backup_root, &bucket_dir).is_err() {
            continue;
        }
        let Ok(mut metadata) = verified_source_metadata(backup_root, &bucket_dir, None) else {
            continue;
        };
        let source_path = PathBuf::from(&metadata.source_path);
        match source_path_state_with_probe(&source_path, &mut source_probe) {
            SourcePathState::Present => {
                if metadata.orphaned_since_ms.take().is_some() {
                    write_source_metadata_record(&bucket_dir, &metadata)?;
                }
                continue;
            }
            SourcePathState::Unavailable => continue,
            SourcePathState::Missing => {}
        }

        match metadata.orphaned_since_ms {
            None => {
                metadata.orphaned_since_ms = Some(now_ms);
                write_source_metadata_record(&bucket_dir, &metadata)?;
            }
            Some(orphaned_since_ms)
                if now_ms.saturating_sub(orphaned_since_ms) >= retention_ms =>
            {
                match validate_backup_bucket_for_removal(
                    backup_root,
                    &bucket_dir,
                    &source_path,
                ) {
                    Ok(files) => remove_validated_backup_bucket(
                        backup_root,
                        &bucket_dir,
                        &source_path,
                        &files,
                    )?,
                    Err(error) if error.kind() == io::ErrorKind::InvalidData => continue,
                    Err(error) => return Err(error),
                }
            }
            Some(_) => {}
        }
    }
    Ok(())
}

fn verified_source_metadata(
    backup_root: &Path,
    bucket_dir: &Path,
    expected_source_path: Option<&Path>,
) -> io::Result<BackupSourceMetadata> {
    validate_existing_backup_bucket(backup_root, bucket_dir)?;
    let metadata_path = bucket_dir.join(SOURCE_METADATA_FILE_NAME);
    let metadata_file = fs::symlink_metadata(&metadata_path)?;
    if !metadata_file.file_type().is_file() || metadata_is_reparse_or_symlink(&metadata_file) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup source metadata must be a real file, not a link or reparse point.",
        ));
    }
    let metadata = read_source_metadata(bucket_dir)?;
    let source_path = PathBuf::from(&metadata.source_path);
    let expected_bucket_name = source_backup_key(&source_path);
    let actual_bucket_name = bucket_dir.file_name().and_then(|name| name.to_str());
    if actual_bucket_name != Some(expected_bucket_name.as_str()) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup bucket does not match its source metadata.",
        ));
    }
    if expected_source_path.is_some_and(|expected| {
        local_path_key(&metadata.source_path) != local_path_key(&expected.to_string_lossy())
    }) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup source metadata does not match the requested history.",
        ));
    }
    Ok(metadata)
}

fn validate_backup_bucket_for_removal(
    backup_root: &Path,
    bucket_dir: &Path,
    source_path: &Path,
) -> io::Result<Vec<PathBuf>> {
    verified_source_metadata(backup_root, bucket_dir, Some(source_path))?;
    let mut files = Vec::new();
    for entry in fs::read_dir(bucket_dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_metadata = fs::symlink_metadata(&path)?;
        if !file_metadata.file_type().is_file()
            || metadata_is_reparse_or_symlink(&file_metadata)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Backup bucket contains a non-file, link, or reparse point.",
            ));
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Backup bucket contains an unsupported file name.",
            ));
        };
        if name != SOURCE_METADATA_FILE_NAME
            && parse_central_backup_name(source_path, &name).is_none()
            && !name
                .strip_prefix('.')
                .and_then(|name| name.strip_suffix(".partial"))
                .is_some_and(|name| parse_central_backup_name(source_path, name).is_some())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Backup bucket contains an unknown file.",
            ));
        }
        files.push(path);
    }
    files.sort_by(|left, right| {
        let left_is_metadata = left
            .file_name()
            .is_some_and(|name| name == SOURCE_METADATA_FILE_NAME);
        let right_is_metadata = right
            .file_name()
            .is_some_and(|name| name == SOURCE_METADATA_FILE_NAME);
        left_is_metadata
            .cmp(&right_is_metadata)
            .then_with(|| left.cmp(right))
    });
    validate_existing_backup_bucket(backup_root, bucket_dir)?;
    Ok(files)
}

fn remove_validated_backup_bucket(
    backup_root: &Path,
    bucket_dir: &Path,
    source_path: &Path,
    expected_files: &[PathBuf],
) -> io::Result<()> {
    let current_files = validate_backup_bucket_for_removal(backup_root, bucket_dir, source_path)?;
    if current_files != expected_files {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup bucket changed while it was being deleted.",
        ));
    }
    for path in current_files {
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.file_type().is_file() || metadata_is_reparse_or_symlink(&metadata) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Backup bucket changed while it was being deleted.",
            ));
        }
        fs::remove_file(path)?;
    }
    validate_existing_backup_bucket(backup_root, bucket_dir)?;
    fs::remove_dir(bucket_dir)
}

fn delete_backup_history_in_roots(
    backup_roots: &BackupRoots,
    source_path: &Path,
) -> io::Result<()> {
    let mut matching_buckets = Vec::new();
    for backup_root in &backup_roots.readable {
        let bucket_dir = central_backup_dir_for_source(backup_root, source_path);
        if safe_existing_backup_bucket(backup_root, &bucket_dir)?.is_none() {
            continue;
        }
        let files = validate_backup_bucket_for_removal(backup_root, &bucket_dir, source_path)?;
        matching_buckets.push((backup_root.clone(), bucket_dir, files));
    }
    matching_buckets.sort_by_key(|(backup_root, _, _)| backup_root == &backup_roots.active);

    for (backup_root, bucket_dir, files) in matching_buckets {
        remove_validated_backup_bucket(&backup_root, &bucket_dir, source_path, &files)?;
    }
    Ok(())
}

fn cleanup_central_backups(
    backup_roots: &BackupRoots,
    source_path: &Path,
    protected_path: Option<&Path>,
    now_ns: u128,
    allow_manual_eviction: bool,
    settings: &BackupSettings,
) -> io::Result<()> {
    maintain_orphaned_backup_histories(
        backup_roots,
        nanoseconds_to_milliseconds(now_ns),
        settings,
    )?;
    cleanup_partial_backup_files_in_roots(backup_roots)?;
    let source_backups = scan_source_backups_in_roots(backup_roots, source_path)?;
    for (kind, retain) in [
        (BackupKind::Previous, 1usize),
        (BackupKind::Automatic, settings.automatic_versions_per_file),
    ] {
        remove_oldest_excess(
            source_backups
                .iter()
                .filter(|backup| backup.kind == kind)
                .cloned()
                .collect(),
            retain,
            protected_path,
        )?;
    }
    if allow_manual_eviction {
        remove_oldest_excess(
            source_backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Manual)
                .cloned()
                .collect(),
            settings.manual_versions_per_file,
            protected_path,
        )?;
    }

    let cutoff_ns = now_ns.saturating_sub(settings.automatic_retention.as_nanos());
    let mut global_backups = scan_all_central_backups_in_roots(backup_roots)?;
    global_backups.sort_by(central_backup_age_order);
    for backup in global_backups
        .iter()
        .filter(|backup| {
            backup.kind != BackupKind::Manual
                && backup.created_ns < cutoff_ns
                && !path_is_protected(&backup.path, protected_path)
        })
    {
        fs::remove_file(&backup.path)?;
    }

    enforce_global_backup_limits(
        backup_roots,
        0,
        0,
        protected_path,
        allow_manual_eviction,
        settings,
    )?;
    remove_empty_backup_buckets_in_roots(backup_roots)
}

fn enforce_global_backup_limits(
    backup_roots: &BackupRoots,
    additional_files: usize,
    additional_bytes: u64,
    protected_path: Option<&Path>,
    allow_manual_eviction: bool,
    settings: &BackupSettings,
) -> io::Result<()> {
    let mut backups = scan_all_central_backups_in_roots(backup_roots)?;
    backups.sort_by(global_backup_cleanup_order);
    let mut remaining_files = backups.len().saturating_add(additional_files);
    let mut remaining_bytes = backups
        .iter()
        .fold(additional_bytes, |total, backup| total.saturating_add(backup.size));
    let mut removals = Vec::new();
    for backup in backups {
        if remaining_files <= settings.max_total_files
            && remaining_bytes <= settings.max_total_bytes
        {
            break;
        }
        if path_is_protected(&backup.path, protected_path)
            || (!allow_manual_eviction && backup.kind == BackupKind::Manual)
        {
            continue;
        }
        remaining_files = remaining_files.saturating_sub(1);
        remaining_bytes = remaining_bytes.saturating_sub(backup.size);
        removals.push(backup.path);
    }
    if remaining_files > settings.max_total_files || remaining_bytes > settings.max_total_bytes {
        return Err(io::Error::new(
            io::ErrorKind::StorageFull,
            "Backup storage limits cannot accommodate this recovery copy.",
        ));
    }
    for path in removals {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn path_is_protected(path: &Path, protected_path: Option<&Path>) -> bool {
    protected_path.is_some_and(|protected| path == protected)
}

fn remove_oldest_excess(
    mut backups: Vec<CentralBackupFile>,
    retain: usize,
    protected_path: Option<&Path>,
) -> io::Result<()> {
    if backups.len() <= retain {
        return Ok(());
    }

    backups.sort_by(central_backup_age_order);
    let remove_count = backups.len() - retain;
    for backup in backups
        .into_iter()
        .filter(|backup| !path_is_protected(&backup.path, protected_path))
        .take(remove_count)
    {
        fs::remove_file(backup.path)?;
    }
    Ok(())
}

fn global_backup_cleanup_order(left: &CentralBackupFile, right: &CentralBackupFile) -> std::cmp::Ordering {
    backup_cleanup_priority(left.kind)
        .cmp(&backup_cleanup_priority(right.kind))
        .then_with(|| central_backup_age_order(left, right))
}

fn backup_cleanup_priority(kind: BackupKind) -> u8 {
    match kind {
        BackupKind::Previous => 0,
        BackupKind::Automatic => 1,
        BackupKind::Manual => 2,
    }
}

fn scan_central_backups_for_source(
    backup_dir: &Path,
    source_path: &Path,
) -> io::Result<Vec<CentralBackupFile>> {
    let mut backups = scan_central_backup_dir(backup_dir)?;
    backups.retain(|backup| {
        backup
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .and_then(|name| parse_central_backup_name(source_path, name))
            .is_some()
    });
    Ok(backups)
}

fn scan_central_backup_dir(backup_dir: &Path) -> io::Result<Vec<CentralBackupFile>> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some((kind, created_ns)) = parse_central_backup_filename(name) else {
            continue;
        };
        let metadata = entry.metadata()?;
        backups.push(CentralBackupFile {
            path,
            created_ns,
            size: metadata.len(),
            kind,
        });
    }
    Ok(backups)
}

fn scan_all_central_backups(backup_root: &Path) -> io::Result<Vec<CentralBackupFile>> {
    if !backup_root.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !is_backup_bucket_name(&entry.file_name()) {
            continue;
        }
        let bucket_dir = entry.path();
        if validate_existing_backup_bucket(backup_root, &bucket_dir).is_err() {
            continue;
        }
        backups.extend(scan_central_backup_dir(&bucket_dir)?);
        backups.extend(scan_partial_backup_files(&bucket_dir)?);
    }
    Ok(backups)
}

fn scan_partial_backup_files(backup_dir: &Path) -> io::Result<Vec<CentralBackupFile>> {
    let mut backups = Vec::new();
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(final_name) = name.strip_prefix('.').and_then(|name| name.strip_suffix(".partial")) else {
            continue;
        };
        let Some((kind, created_ns)) = parse_central_backup_filename(final_name) else {
            continue;
        };
        backups.push(CentralBackupFile {
            path,
            created_ns,
            size: entry.metadata()?.len(),
            kind,
        });
    }
    Ok(backups)
}

fn scan_all_central_backups_in_roots(backup_roots: &BackupRoots) -> io::Result<Vec<CentralBackupFile>> {
    let mut backups = Vec::new();
    for backup_root in &backup_roots.readable {
        match scan_all_central_backups(backup_root) {
            Ok(root_backups) => backups.extend(root_backups),
            Err(error) if backup_root == &backup_roots.active => return Err(error),
            Err(_) => continue,
        }
    }
    Ok(backups)
}

fn scan_source_backups_in_roots(
    backup_roots: &BackupRoots,
    source_path: &Path,
) -> io::Result<Vec<CentralBackupFile>> {
    let mut backups = Vec::new();
    for backup_root in &backup_roots.readable {
        let backup_dir = central_backup_dir_for_source(backup_root, source_path);
        let result = safe_existing_backup_bucket(backup_root, &backup_dir).and_then(|directory| {
            directory
                .map(|directory| scan_central_backups_for_source(&directory, source_path))
                .transpose()
                .map(|backups| backups.unwrap_or_default())
        });
        match result {
            Ok(root_backups) => backups.extend(root_backups),
            Err(error) if backup_root == &backup_roots.active => return Err(error),
            Err(_) => continue,
        }
    }
    Ok(backups)
}

fn cleanup_partial_backup_files_in_roots(backup_roots: &BackupRoots) -> io::Result<()> {
    for backup_root in &backup_roots.readable {
        if let Err(error) = cleanup_partial_backup_files(backup_root) {
            if backup_root == &backup_roots.active {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn cleanup_partial_backup_files(backup_root: &Path) -> io::Result<()> {
    if !backup_root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !is_backup_bucket_name(&entry.file_name()) {
            continue;
        }
        let bucket_dir = entry.path();
        if validate_existing_backup_bucket(backup_root, &bucket_dir).is_err() {
            continue;
        }
        for backup in fs::read_dir(bucket_dir)? {
            let backup = backup?;
            if !backup.file_type()?.is_file() {
                continue;
            }
            let name = backup.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if name.starts_with('.') && name.ends_with(".bak.partial") {
                fs::remove_file(backup.path())?;
            }
        }
    }
    Ok(())
}

fn remove_empty_backup_buckets(backup_root: &Path) -> io::Result<()> {
    if !backup_root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !is_backup_bucket_name(&entry.file_name()) {
            continue;
        }
        let bucket_dir = entry.path();
        if validate_existing_backup_bucket(backup_root, &bucket_dir).is_err() {
            continue;
        }
        remove_validated_backup_bucket_if_empty(&bucket_dir)?;
    }
    Ok(())
}

fn remove_validated_backup_bucket_if_empty(bucket_dir: &Path) -> io::Result<()> {
    if scan_central_backup_dir(bucket_dir)?.is_empty() {
        let remaining = fs::read_dir(bucket_dir)?
            .map(|entry| entry.map(|entry| entry.file_name()))
            .collect::<io::Result<Vec<_>>>()?;
        if remaining.is_empty()
            || remaining.iter().all(|name| name == SOURCE_METADATA_FILE_NAME)
        {
            let _ = fs::remove_file(bucket_dir.join(SOURCE_METADATA_FILE_NAME));
            fs::remove_dir(bucket_dir)?;
        }
    }
    Ok(())
}

fn remove_empty_backup_buckets_in_roots(backup_roots: &BackupRoots) -> io::Result<()> {
    for backup_root in &backup_roots.readable {
        if let Err(error) = remove_empty_backup_buckets(backup_root) {
            if backup_root == &backup_roots.active {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn central_backup_age_order(left: &CentralBackupFile, right: &CentralBackupFile) -> std::cmp::Ordering {
    left.created_ns
        .cmp(&right.created_ns)
        .then_with(|| left.path.cmp(&right.path))
}

fn central_backup_dir_for_source(backup_root: &Path, path: &Path) -> PathBuf {
    backup_root.join(source_backup_key(path))
}

fn prepare_safe_backup_bucket(backup_root: &Path, backup_dir: &Path) -> io::Result<()> {
    fs::create_dir_all(backup_root)?;
    match fs::symlink_metadata(backup_dir) {
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match fs::create_dir(backup_dir) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
        Err(error) => return Err(error),
    }
    validate_existing_backup_bucket(backup_root, backup_dir)
}

fn safe_existing_backup_bucket(backup_root: &Path, backup_dir: &Path) -> io::Result<Option<PathBuf>> {
    match fs::symlink_metadata(backup_dir) {
        Ok(_) => {
            validate_existing_backup_bucket(backup_root, backup_dir)?;
            Ok(Some(backup_dir.to_path_buf()))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn validate_existing_backup_bucket(backup_root: &Path, backup_dir: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(backup_dir)?;
    if !metadata.file_type().is_dir() || metadata_is_reparse_or_symlink(&metadata) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup bucket must be a real directory, not a link or reparse point.",
        ));
    }
    let canonical_root = backup_root.canonicalize()?;
    let canonical_bucket = backup_dir.canonicalize()?;
    if canonical_bucket.parent() != Some(canonical_root.as_path()) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Backup bucket is not a direct child of the configured backup root.",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn metadata_is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_type().is_symlink()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn metadata_is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn legacy_backup_dir_for_source(path: &Path) -> PathBuf {
    path.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(LEGACY_BACKUP_DIR_NAME)
}

fn source_backup_key(path: &Path) -> String {
    let identity = local_path_key(&path.to_string_lossy());
    format!("{:x}", Sha256::digest(identity.as_bytes()))
}

fn is_backup_bucket_name(name: &std::ffi::OsStr) -> bool {
    name.to_str().is_some_and(|name| {
        name.len() == 64 && name.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn backup_prefix_for_source(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.md");
    format!("{}.", sanitize_backup_name(file_name))
}

fn parse_central_backup_name(source_path: &Path, name: &str) -> Option<(BackupKind, u128)> {
    parse_central_backup_name_for_platform(source_path, name, cfg!(windows))
}

fn parse_central_backup_name_for_platform(
    source_path: &Path,
    name: &str,
    windows: bool,
) -> Option<(BackupKind, u128)> {
    let prefix = backup_prefix_for_source(source_path);
    let candidate_prefix = name.get(..prefix.len())?;
    let prefix_matches = if windows {
        candidate_prefix.eq_ignore_ascii_case(&prefix)
    } else {
        candidate_prefix == prefix
    };
    if !prefix_matches {
        return None;
    }
    let value = name.get(prefix.len()..)?.strip_suffix(".bak")?;
    let (kind, nonce) = value.split_once('.')?;
    if nonce.contains('.') {
        return None;
    }
    Some((BackupKind::parse(kind)?, nonce.parse().ok()?))
}

fn parse_central_backup_filename(name: &str) -> Option<(BackupKind, u128)> {
    let value = name.strip_suffix(".bak")?;
    let (prefix_and_kind, nonce) = value.rsplit_once('.')?;
    let (prefix, kind) = prefix_and_kind.rsplit_once('.')?;
    if prefix.is_empty() {
        return None;
    }
    Some((BackupKind::parse(kind)?, nonce.parse().ok()?))
}

fn is_legacy_backup_name(source_path: &Path, name: &str) -> bool {
    name.starts_with(&backup_prefix_for_source(source_path)) && name.ends_with(".bak")
}

fn system_time_nanoseconds(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn nanoseconds_to_milliseconds(nanoseconds: u128) -> u64 {
    (nanoseconds / 1_000_000).min(u128::from(u64::MAX)) as u64
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
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use super::{
        atomic_write, atomic_write_checked, atomic_write_checked_with_hook,
        atomic_write_checked_with_ops,
        backup_existing_file_at, backup_existing_file_at_with_metadata_writer,
        backup_prefix_for_source,
        backup_roots_from_default,
        central_backup_dir_for_source, cleanup_central_backups, configured_backup_root,
        create_central_backup, create_new_file, decode_text_bytes,
        enforce_global_backup_limits, file_association_command, file_stats_for,
        legacy_backup_dir_for_source, list_backup_histories_in_roots, list_backups_for_source,
        markdown_file_paths_from_args, parse_central_backup_name_for_platform,
        reveal_command_for_platform, save_dialog_defaults, scan_all_central_backups,
        scan_central_backup_dir, secondary_instance_markdown_paths, source_backup_key,
        source_stats_before_backup, system_time_nanoseconds, validate_backup_path, validate_backup_settings,
        verify_expected_file_missing, verify_expected_file_stats, verify_source_state_after_backup,
        BackupKind, BackupRoots,
        BackupSettings, BackupSettingsInput,
        FileAssociationScope, FileManagerCommandSpec, RequestedBackupKind,
        FILE_CHANGED_DURING_SAVE_ERROR, MIB,
    };

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

    #[test]
    fn checked_write_publishes_missing_target_without_clobbering_a_racing_create() {
        let root = temporary_test_dir("checked-write-missing-race");
        let published = root.join("Published.md");
        atomic_write_checked(&published, b"# Published", None).unwrap();
        assert_eq!(std::fs::read_to_string(&published).unwrap(), "# Published");

        let raced = root.join("Raced.md");
        let error = atomic_write_checked_with_hook(
            &raced,
            b"# App content",
            None,
            |temp_path, rollback_path| {
                assert!(temp_path.is_file());
                assert!(rollback_path.is_none());
                std::fs::write(&raced, "# External content")
            },
        )
        .unwrap_err();

        assert_eq!(error.to_string(), FILE_CHANGED_DURING_SAVE_ERROR);
        assert_eq!(std::fs::read_to_string(&raced).unwrap(), "# External content");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 2);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checked_write_restores_existing_file_when_rollback_stats_change() {
        let root = temporary_test_dir("checked-write-rollback-mismatch");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Original").unwrap();
        let expected_stats = file_stats_for(&path).unwrap();

        let error = atomic_write_checked_with_hook(
            &path,
            b"# App content",
            Some(expected_stats),
            |_temp_path, rollback_path| {
                std::fs::write(rollback_path.unwrap(), "# External rollback change")
            },
        )
        .unwrap_err();

        assert_eq!(error.to_string(), FILE_CHANGED_DURING_SAVE_ERROR);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "# External rollback change"
        );
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checked_write_replaces_a_matching_existing_file() {
        let root = temporary_test_dir("checked-write-existing-success");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Original").unwrap();
        let expected_stats = file_stats_for(&path).unwrap();

        atomic_write_checked(&path, b"# Updated", Some(expected_stats)).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Updated");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checked_write_keeps_existing_file_when_hard_links_are_unavailable() {
        let root = temporary_test_dir("checked-write-no-hard-links");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Original").unwrap();
        let expected_stats = file_stats_for(&path).unwrap();

        let error = atomic_write_checked_with_ops(
            &path,
            b"# Updated",
            Some(expected_stats),
            |_temp_path, _rollback_path| Ok(()),
            |_source, _destination| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::Unsupported,
                    "hard links unavailable",
                ))
            },
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Original");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checked_write_preserves_external_target_created_after_existing_move() {
        let root = temporary_test_dir("checked-write-existing-race");
        let path = root.join("Draft.md");
        std::fs::write(&path, "# Original").unwrap();
        let expected_stats = file_stats_for(&path).unwrap();
        let mut recovery_path = None;

        let error = atomic_write_checked_with_hook(
            &path,
            b"# App content",
            Some(expected_stats),
            |_temp_path, rollback_path| {
                recovery_path = rollback_path.map(Path::to_path_buf);
                std::fs::write(&path, "# External content")
            },
        )
        .unwrap_err();

        let recovery_path = recovery_path.unwrap();
        assert!(error.to_string().contains(FILE_CHANGED_DURING_SAVE_ERROR));
        assert!(error.to_string().contains(&recovery_path.to_string_lossy().to_string()));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# External content");
        assert_eq!(std::fs::read_to_string(&recovery_path).unwrap(), "# Original");

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

    #[test]
    fn expected_existing_source_disappearance_is_never_treated_as_a_new_file() {
        let root = temporary_test_dir("source-disappeared-before-backup");
        let source = root.join("Draft.md");
        std::fs::write(&source, "existing").unwrap();
        assert!(source_stats_before_backup(&source, false).unwrap().is_some());
        std::fs::remove_file(&source).unwrap();

        let result: Result<(), String> = source_stats_before_backup(&source, false).and_then(|_| {
            atomic_write(&source, b"replacement").map_err(|error| error.to_string())?;
            Ok(())
        });
        assert_eq!(result.unwrap_err(), FILE_CHANGED_DURING_SAVE_ERROR);
        assert!(!source.exists());

        std::fs::write(&source, "external create").unwrap();
        assert_eq!(
            source_stats_before_backup(&source, true).unwrap_err(),
            FILE_CHANGED_DURING_SAVE_ERROR
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expected_missing_source_created_during_backup_is_rejected_before_save() {
        let root = temporary_test_dir("source-created-during-backup");
        let source = root.join("Draft.md");
        let source_stats = source_stats_before_backup(&source, true).unwrap();
        assert!(source_stats.is_none());

        std::fs::write(&source, "external create").unwrap();

        assert_eq!(
            verify_source_state_after_backup(&source, source_stats).unwrap_err(),
            FILE_CHANGED_DURING_SAVE_ERROR
        );
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "external create");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn windows_backup_prefix_matching_is_ascii_case_insensitive_only_on_windows() {
        let source = Path::new("C:/Notes/Draft.md");
        let differently_cased = "draft.md.manual.123.bak";
        assert!(parse_central_backup_name_for_platform(source, differently_cased, true).is_some());
        assert!(parse_central_backup_name_for_platform(source, differently_cased, false).is_none());
        assert!(parse_central_backup_name_for_platform(source, "Draft.md.manual.123.bak", false).is_some());
    }

    #[test]
    fn backup_settings_validate_ranges_and_cap_single_files_to_total_size() {
        let settings = validate_backup_settings(BackupSettingsInput::default()).unwrap();
        assert_eq!(settings.checkpoint_interval, Duration::from_secs(10 * 60));
        assert_eq!(settings.automatic_versions_per_file, 48);
        assert_eq!(settings.manual_versions_per_file, 32);
        assert_eq!(settings.orphan_retention, Duration::from_secs(365 * 24 * 60 * 60));

        let mut input = BackupSettingsInput::default();
        input.checkpoint_interval_minutes = 0;
        assert!(validate_backup_settings(input).is_err());

        let mut input = BackupSettingsInput::default();
        input.directory = Some("relative/backups".to_string());
        assert!(validate_backup_settings(input).is_err());

        let mut input = BackupSettingsInput::default();
        input.max_total_size_mb = 256;
        input.max_backup_file_size_mb = 4_096;
        let settings = validate_backup_settings(input).unwrap();
        assert_eq!(settings.max_backup_file_bytes, 256 * MIB);

        let mut input = BackupSettingsInput::default();
        input.orphan_retention_days = 6;
        assert!(validate_backup_settings(input).is_err());

        let mut input = BackupSettingsInput::default();
        input.orphan_retention_days = 3_651;
        assert!(validate_backup_settings(input).is_err());
    }

    #[test]
    fn custom_backup_roots_use_the_product_container() {
        let root = temporary_test_dir("custom-backup-root");
        assert_eq!(
            configured_backup_root(&root),
            root.join("NyaMarkdownor Backups").join("backups-v1")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn switching_backup_directories_keeps_default_and_previous_roots_readable() {
        let root = temporary_test_dir("backup-root-switching");
        let default_root = root.join("app-data").join("backups-v1");
        let custom = root.join("custom");
        let mut settings = test_backup_settings();
        settings.directory = Some(custom.clone());

        let roots = backup_roots_from_default(default_root.clone(), &settings, false).unwrap();
        assert_eq!(roots.active, configured_backup_root(&custom));
        assert!(roots.readable.contains(&default_root));

        settings.directory = None;
        settings.previous_directories = vec![custom.clone()];
        let roots = backup_roots_from_default(default_root.clone(), &settings, false).unwrap();
        assert_eq!(roots.active, default_root);
        assert!(roots.readable.contains(&configured_backup_root(&custom)));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_backup_roots_are_deduplicated_by_physical_identity() {
        let root = temporary_test_dir("backup-root-physical-identity");
        let base = root.join("shared");
        let default_root = configured_backup_root(&base);
        std::fs::create_dir_all(&default_root).unwrap();
        let mut settings = test_backup_settings();
        settings.previous_directories = vec![base.join(".")];

        let roots = backup_roots_from_default(default_root.clone(), &settings, false).unwrap();
        assert_eq!(roots.active, default_root);
        assert_eq!(roots.readable.len(), 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn partial_backup_files_are_never_listed_as_recovery_versions() {
        let root = temporary_test_dir("partial-backup-hidden");
        let backup_root = root.join("backups-v1");
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        std::fs::create_dir_all(&bucket).unwrap();
        std::fs::write(
            bucket.join(format!(".{}previous.123.bak.partial", backup_prefix_for_source(&source))),
            "incomplete",
        )
        .unwrap();

        assert!(scan_central_backup_dir(&bucket).unwrap().is_empty());
        assert!(list_backups_for_source(&test_backup_roots(&backup_root), &source)
            .unwrap()
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_backup_bucket_is_rejected_without_following_external_target() {
        use std::os::unix::fs::symlink;

        let root = temporary_test_dir("symlink-backup-bucket");
        let backup_root = root.join("backups-v1");
        let external_target = root.join("external-target");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::create_dir_all(&backup_root).unwrap();
        std::fs::create_dir_all(&external_target).unwrap();
        std::fs::write(&source, "current").unwrap();

        let bucket = central_backup_dir_for_source(&backup_root, &source);
        symlink(&external_target, &bucket).unwrap();
        let error = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(5_500_000),
            &test_backup_settings(),
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "current");
        assert_eq!(std::fs::read_dir(&external_target).unwrap().count(), 0);

        let planted_backup = external_target.join(format!(
            "{}manual.123.bak",
            backup_prefix_for_source(&source)
        ));
        std::fs::write(&planted_backup, "outside").unwrap();
        super::write_source_metadata(
            &external_target,
            &source,
            UNIX_EPOCH + Duration::from_secs(123),
        )
        .unwrap();

        assert!(scan_all_central_backups(&backup_root).unwrap().is_empty());
        assert!(list_backup_histories_in_roots(&backup_roots)
            .unwrap()
            .is_empty());
        assert!(list_backups_for_source(&backup_roots, &source).is_err());
        assert!(planted_backup.exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maintenance_removes_crash_partial_files_across_readable_roots() {
        let root = temporary_test_dir("partial-backup-maintenance");
        let active_root = root.join("active").join("backups-v1");
        let previous_root = root.join("previous").join("backups-v1");
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();
        let mut partials = Vec::new();
        for backup_root in [&active_root, &previous_root] {
            let bucket = central_backup_dir_for_source(backup_root, &source);
            std::fs::create_dir_all(&bucket).unwrap();
            let partial = bucket.join(format!(
                ".{}previous.123.bak.partial",
                backup_prefix_for_source(&source)
            ));
            std::fs::write(&partial, "incomplete").unwrap();
            partials.push(partial);
        }
        let backup_roots = BackupRoots {
            active: active_root.clone(),
            readable: vec![active_root, previous_root],
        };

        assert_eq!(
            backup_roots
                .readable
                .iter()
                .map(|root| scan_all_central_backups(root).unwrap().len())
                .sum::<usize>(),
            2
        );

        cleanup_central_backups(
            &backup_roots,
            &source,
            None,
            system_time_nanoseconds(UNIX_EPOCH + Duration::from_secs(100)),
            false,
            &test_backup_settings(),
        )
        .unwrap();

        assert!(partials.iter().all(|partial| !partial.exists()));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn source_metadata_keeps_deleted_files_visible_as_orphaned_histories() {
        let root = temporary_test_dir("orphaned-backup-history");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(5_000_000),
            &test_backup_settings(),
        )
        .unwrap();
        std::fs::remove_file(&source).unwrap();

        let histories = list_backup_histories_in_roots(&backup_roots).unwrap();
        assert_eq!(histories.len(), 1);
        assert_eq!(histories[0].source_path, source.to_string_lossy());
        assert_eq!(histories[0].file_name, "Draft.md");
        assert_eq!(histories[0].backup_count, 1);
        assert!(!histories[0].source_exists);
        assert!(histories[0].latest_backup_path.is_some());
        let json = serde_json::to_value(&histories[0]).unwrap();
        assert_eq!(json["backupCount"], 1);
        assert_eq!(json["totalSize"], 7);
        assert!(json["latestBackupPath"].is_string());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn orphan_maintenance_marks_old_metadata_before_starting_retention() {
        let root = temporary_test_dir("orphan-first-marker");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "manual checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(1_000),
            &test_backup_settings(),
        )
        .unwrap();
        std::fs::remove_file(&source).unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        let old_metadata_json = std::fs::read_to_string(bucket.join(super::SOURCE_METADATA_FILE_NAME))
            .unwrap();
        assert!(!old_metadata_json.contains("orphanedSinceMs"));

        super::maintain_orphaned_backup_histories(
            &backup_roots,
            10_000,
            &test_backup_settings(),
        )
        .unwrap();

        assert!(bucket.exists());
        assert_eq!(
            super::read_source_metadata(&bucket)
                .unwrap()
                .orphaned_since_ms,
            Some(10_000)
        );
        assert_eq!(scan_central_backup_dir(&bucket).unwrap().len(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn orphan_maintenance_keeps_manual_history_before_expiry() {
        let root = temporary_test_dir("orphan-manual-before-expiry");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "manual checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(2_000),
            &test_backup_settings(),
        )
        .unwrap();
        std::fs::remove_file(&source).unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);

        super::maintain_orphaned_backup_histories(
            &backup_roots,
            1_000,
            &test_backup_settings(),
        )
        .unwrap();
        super::maintain_orphaned_backup_histories(
            &backup_roots,
            1_000 + 364 * 24 * 60 * 60 * 1_000,
            &test_backup_settings(),
        )
        .unwrap();

        let backups = scan_central_backup_dir(&bucket).unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].kind, BackupKind::Manual);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unavailable_source_neither_starts_nor_expires_orphan_retention() {
        let root = temporary_test_dir("orphan-unavailable");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("offline-volume").join("Draft.md");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, "manual checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(2_500),
            &test_backup_settings(),
        )
        .unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        let access_denied = |_path: &Path| {
            Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "simulated unavailable source",
            ))
        };

        super::maintain_orphaned_backup_histories_in_root_with_probe(
            &backup_root,
            10_000,
            test_backup_settings().orphan_retention,
            access_denied,
        )
        .unwrap();
        assert_eq!(
            super::read_source_metadata(&bucket)
                .unwrap()
                .orphaned_since_ms,
            None
        );

        let mut metadata = super::read_source_metadata(&bucket).unwrap();
        metadata.orphaned_since_ms = Some(1_000);
        super::write_source_metadata_record(&bucket, &metadata).unwrap();
        super::maintain_orphaned_backup_histories_in_root_with_probe(
            &backup_root,
            1_000 + 366 * 24 * 60 * 60 * 1_000,
            test_backup_settings().orphan_retention,
            access_denied,
        )
        .unwrap();

        assert!(bucket.exists());
        assert_eq!(
            super::read_source_metadata(&bucket)
                .unwrap()
                .orphaned_since_ms,
            Some(1_000)
        );
        assert_eq!(scan_central_backup_dir(&bucket).unwrap().len(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unavailable_source_is_not_exposed_as_an_orphaned_history() {
        let root = temporary_test_dir("orphan-unavailable-listing");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("offline-volume").join("Draft.md");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, "manual checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(2_600),
            &test_backup_settings(),
        )
        .unwrap();
        let mut histories = std::collections::HashMap::new();

        super::append_backup_histories_with_probe(
            &backup_root,
            &mut histories,
            &mut |_path| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "simulated unavailable source",
                ))
            },
        )
        .unwrap();

        assert_eq!(histories.len(), 1);
        assert!(histories.into_values().next().unwrap().source_exists);
        assert_eq!(
            super::source_path_state_with_probe(&source, |_path| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "missing",
                ))
            }),
            super::SourcePathState::Unavailable
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expired_orphan_maintenance_removes_every_central_version_and_metadata() {
        let root = temporary_test_dir("orphan-expired-whole-bucket");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        std::fs::create_dir_all(&bucket).unwrap();
        std::fs::write(&source, "checkpoint").unwrap();
        for (kind, created_seconds) in [
            (BackupKind::Previous, 100),
            (BackupKind::Automatic, 200),
            (BackupKind::Manual, 300),
        ] {
            create_central_backup(
                &bucket,
                &source,
                kind,
                UNIX_EPOCH + Duration::from_secs(created_seconds),
                file_stats_for(&source).unwrap(),
            )
            .unwrap();
        }
        std::fs::write(
            bucket.join(format!(
                ".{}automatic.400.bak.partial",
                backup_prefix_for_source(&source)
            )),
            "partial",
        )
        .unwrap();
        super::write_source_metadata(
            &bucket,
            &source,
            UNIX_EPOCH + Duration::from_secs(500),
        )
        .unwrap();
        std::fs::remove_file(&source).unwrap();
        let mut metadata = super::read_source_metadata(&bucket).unwrap();
        metadata.orphaned_since_ms = Some(1_000);
        super::write_source_metadata_record(&bucket, &metadata).unwrap();
        let mut settings = test_backup_settings();
        settings.orphan_retention = Duration::from_secs(7 * 24 * 60 * 60);

        super::maintain_orphaned_backup_histories(
            &backup_roots,
            1_000 + 7 * 24 * 60 * 60 * 1_000,
            &settings,
        )
        .unwrap();

        assert!(!bucket.exists());
        assert!(std::fs::read_dir(&backup_root).unwrap().next().is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expired_orphan_maintenance_preserves_bucket_with_unknown_content() {
        let root = temporary_test_dir("orphan-expired-unknown-content");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "manual checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(1_000),
            &test_backup_settings(),
        )
        .unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        std::fs::remove_file(&source).unwrap();
        let mut metadata = super::read_source_metadata(&bucket).unwrap();
        metadata.orphaned_since_ms = Some(1_000);
        super::write_source_metadata_record(&bucket, &metadata).unwrap();
        let unknown = bucket.join("do-not-delete.bin");
        std::fs::write(&unknown, "unrecognized").unwrap();
        let manual_backup = scan_central_backup_dir(&bucket).unwrap().remove(0).path;
        let mut settings = test_backup_settings();
        settings.orphan_retention = Duration::from_secs(7 * 24 * 60 * 60);

        super::maintain_orphaned_backup_histories(
            &backup_roots,
            1_000 + 7 * 24 * 60 * 60 * 1_000,
            &settings,
        )
        .unwrap();

        assert!(bucket.exists());
        assert!(manual_backup.exists());
        assert!(unknown.exists());
        assert!(bucket.join(super::SOURCE_METADATA_FILE_NAME).exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn orphan_maintenance_clears_marker_when_source_returns() {
        let root = temporary_test_dir("orphan-source-returned");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "checkpoint").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(3_000),
            &test_backup_settings(),
        )
        .unwrap();
        std::fs::remove_file(&source).unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        super::maintain_orphaned_backup_histories(
            &backup_roots,
            5_000,
            &test_backup_settings(),
        )
        .unwrap();
        assert_eq!(
            super::read_source_metadata(&bucket)
                .unwrap()
                .orphaned_since_ms,
            Some(5_000)
        );

        std::fs::write(&source, "restored").unwrap();
        super::maintain_orphaned_backup_histories(
            &backup_roots,
            6_000,
            &test_backup_settings(),
        )
        .unwrap();

        assert_eq!(
            super::read_source_metadata(&bucket)
                .unwrap()
                .orphaned_since_ms,
            None
        );
        assert_eq!(scan_central_backup_dir(&bucket).unwrap().len(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_history_deletion_removes_matching_buckets_across_roots_only() {
        let root = temporary_test_dir("explicit-history-delete-cross-root");
        let active_root = root.join("active").join("backups-v1");
        let previous_root = root.join("previous").join("backups-v1");
        let backup_roots = BackupRoots {
            active: active_root.clone(),
            readable: vec![active_root.clone(), previous_root.clone()],
        };
        let source = root.join("Draft.md");
        std::fs::write(&source, "checkpoint").unwrap();
        for (backup_root, created_seconds) in [(&active_root, 100), (&previous_root, 200)] {
            let bucket = central_backup_dir_for_source(backup_root, &source);
            std::fs::create_dir_all(&bucket).unwrap();
            create_central_backup(
                &bucket,
                &source,
                BackupKind::Manual,
                UNIX_EPOCH + Duration::from_secs(created_seconds),
                file_stats_for(&source).unwrap(),
            )
            .unwrap();
            super::write_source_metadata(
                &bucket,
                &source,
                UNIX_EPOCH + Duration::from_secs(created_seconds),
            )
            .unwrap();
        }
        let unrelated_source = root.join("Other.md");
        let unrelated_bucket = central_backup_dir_for_source(&active_root, &unrelated_source);
        std::fs::create_dir_all(&unrelated_bucket).unwrap();
        std::fs::write(&unrelated_source, "other").unwrap();
        super::write_source_metadata(&unrelated_bucket, &unrelated_source, UNIX_EPOCH).unwrap();
        let legacy_dir = legacy_backup_dir_for_source(&source);
        std::fs::create_dir_all(&legacy_dir).unwrap();
        let legacy_backup = legacy_dir.join("Draft.md.manual.1.bak");
        std::fs::write(&legacy_backup, "legacy").unwrap();

        super::delete_backup_history_in_roots(&backup_roots, &source).unwrap();

        assert!(!central_backup_dir_for_source(&active_root, &source).exists());
        assert!(!central_backup_dir_for_source(&previous_root, &source).exists());
        assert!(unrelated_bucket.exists());
        assert!(legacy_backup.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_history_deletion_rejects_mismatched_bucket_metadata() {
        let root = temporary_test_dir("explicit-history-delete-mismatch");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let other_source = root.join("Other.md");
        std::fs::write(&source, "checkpoint").unwrap();
        let bucket = central_backup_dir_for_source(&backup_root, &source);
        std::fs::create_dir_all(&bucket).unwrap();
        let backup = create_central_backup(
            &bucket,
            &source,
            BackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(100),
            file_stats_for(&source).unwrap(),
        )
        .unwrap()
        .0;
        super::write_source_metadata(&bucket, &other_source, UNIX_EPOCH).unwrap();

        let error = super::delete_backup_history_in_roots(&backup_roots, &source).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert!(bucket.exists());
        assert!(backup.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_history_deletion_prevalidates_all_roots_before_removing_any() {
        let root = temporary_test_dir("explicit-history-delete-prevalidation");
        let active_root = root.join("active").join("backups-v1");
        let previous_root = root.join("previous").join("backups-v1");
        let backup_roots = BackupRoots {
            active: active_root.clone(),
            readable: vec![active_root.clone(), previous_root.clone()],
        };
        let source = root.join("Draft.md");
        std::fs::write(&source, "checkpoint").unwrap();
        for (backup_root, created_seconds) in [(&active_root, 100), (&previous_root, 200)] {
            let bucket = central_backup_dir_for_source(backup_root, &source);
            std::fs::create_dir_all(&bucket).unwrap();
            create_central_backup(
                &bucket,
                &source,
                BackupKind::Manual,
                UNIX_EPOCH + Duration::from_secs(created_seconds),
                file_stats_for(&source).unwrap(),
            )
            .unwrap();
            super::write_source_metadata(
                &bucket,
                &source,
                UNIX_EPOCH + Duration::from_secs(created_seconds),
            )
            .unwrap();
        }
        let active_bucket = central_backup_dir_for_source(&active_root, &source);
        let previous_bucket = central_backup_dir_for_source(&previous_root, &source);
        std::fs::create_dir(previous_bucket.join("unknown-child")).unwrap();

        let error = super::delete_backup_history_in_roots(&backup_roots, &source).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert!(active_bucket.exists());
        assert_eq!(scan_central_backup_dir(&active_bucket).unwrap().len(), 1);
        assert!(previous_bucket.exists());
        assert_eq!(scan_central_backup_dir(&previous_bucket).unwrap().len(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn metadata_write_failure_removes_new_backup_and_empty_active_bucket() {
        let root = temporary_test_dir("metadata-failure-cleans-bucket");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();
        let backup_dir = central_backup_dir_for_source(&backup_root, &source);

        let error = backup_existing_file_at_with_metadata_writer(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(5_500_000),
            &test_backup_settings(),
            |backup_dir, _source_path, _now| {
                std::fs::write(
                    backup_dir.join(super::SOURCE_METADATA_FILE_NAME),
                    "partial metadata",
                )?;
                Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "simulated metadata failure",
                ))
            },
        )
        .unwrap_err();

        assert_eq!(error.to_string(), "simulated metadata failure");
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "current");
        assert!(!backup_dir.exists());
        assert!(scan_all_central_backups(&backup_root).unwrap().is_empty());
        assert!(std::fs::read_dir(&backup_root).unwrap().next().is_none());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oversized_sources_are_rejected_before_any_backup_is_created() {
        let root = temporary_test_dir("oversized-backup-source");
        let backup_root = root.join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "too large").unwrap();
        let mut settings = test_backup_settings();
        settings.max_backup_file_bytes = 4;

        let error = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(6_000_000),
            &settings,
        )
        .unwrap_err();
        assert!(error.to_string().contains("exceeding the configured maximum"));
        assert!(!backup_root.exists());
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "too large");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unavailable_previous_roots_do_not_block_active_backup_writes() {
        let root = temporary_test_dir("unavailable-previous-root");
        let active = root.join("active").join("backups-v1");
        let unavailable = root.join("offline-root");
        std::fs::write(&unavailable, "not a folder").unwrap();
        let backup_roots = BackupRoots {
            active: active.clone(),
            readable: vec![active, unavailable],
        };
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();

        let backup = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(7_000_000),
            &test_backup_settings(),
        )
        .unwrap()
        .unwrap();
        assert!(backup.exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn central_backup_paths_are_stable_and_isolated_by_source_path() {
        let root = temporary_test_dir("backup-path-keys");
        let backup_root = root.join("app-data").join("backups-v1");
        let first = root.join("one").join("Draft.md");
        let second = root.join("two").join("Draft.md");

        assert_eq!(source_backup_key(&first), source_backup_key(&first));
        assert_eq!(source_backup_key(&first).len(), 64);
        assert_ne!(source_backup_key(&first), source_backup_key(&second));
        assert_eq!(
            central_backup_dir_for_source(&backup_root, &first).parent(),
            Some(backup_root.as_path())
        );
        assert_ne!(
            central_backup_dir_for_source(&backup_root, &first),
            central_backup_dir_for_source(&backup_root, &second)
        );
        assert_eq!(
            legacy_backup_dir_for_source(&first),
            first.parent().unwrap().join(".nyamarkdownor-backups")
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_backups_keep_one_previous_version_between_checkpoints() {
        let root = temporary_test_dir("automatic-backup-throttle");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let start = UNIX_EPOCH + Duration::from_secs(1_000_000);
        let settings = test_backup_settings();
        std::fs::write(&source, "version one").unwrap();

        let first = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            start,
            &settings,
        )
        .unwrap()
        .unwrap();
        std::fs::write(&source, "version two").unwrap();
        let manual = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            start + Duration::from_secs(60),
            &settings,
        )
        .unwrap()
        .unwrap();
        std::fs::write(&source, "version three").unwrap();

        let previous = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            start + Duration::from_secs(5 * 60),
            &settings,
        )
        .unwrap()
        .unwrap();
        assert_ne!(previous, manual);
        assert_eq!(std::fs::read_to_string(&previous).unwrap(), "version three");
        let backups = scan_central_backup_dir(first.parent().unwrap()).unwrap();
        assert_eq!(backups.len(), 3);
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Previous)
                .count(),
            1
        );

        std::fs::write(&source, "version four").unwrap();
        let checkpoint = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            start + Duration::from_secs(11 * 60),
            &settings,
        )
        .unwrap()
        .unwrap();
        assert_ne!(checkpoint, first);
        assert_eq!(std::fs::read_to_string(checkpoint).unwrap(), "version four");
        let backups = scan_central_backup_dir(first.parent().unwrap()).unwrap();
        assert_eq!(backups.len(), 3);
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Automatic)
                .count(),
            2
        );
        assert!(backups
            .iter()
            .all(|backup| backup.kind != BackupKind::Previous));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn capacity_cleanup_keeps_new_previous_and_recent_automatic() {
        let root = temporary_test_dir("capacity-keeps-new-previous");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let start = 1_500_000;
        let old_previous = seed_central_backup_kind(
            &backup_root,
            &source,
            BackupKind::Previous,
            start,
            "old previous",
        );
        let automatic = seed_central_backup_kind(
            &backup_root,
            &source,
            BackupKind::Automatic,
            start + 60,
            "recent automatic",
        );
        std::fs::write(&source, "new previous").unwrap();
        let mut settings = test_backup_settings();
        settings.max_total_files = 2;

        let new_previous = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(start + 120),
            &settings,
        )
        .unwrap()
        .unwrap();

        assert!(!old_previous.exists());
        assert!(automatic.exists());
        assert!(new_previous.exists());
        assert_eq!(std::fs::read_to_string(&new_previous).unwrap(), "new previous");
        let backups = scan_central_backup_dir(&central_backup_dir_for_source(&backup_root, &source)).unwrap();
        assert_eq!(backups.len(), 2);
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Automatic)
                .count(),
            1
        );
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Previous)
                .count(),
            1
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_capacity_failure_preserves_all_backups_without_partial_cleanup() {
        let root = temporary_test_dir("automatic-capacity-no-partial-cleanup");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let manual = seed_central_backup_kind(
            &backup_root,
            &root.join("Manual.md"),
            BackupKind::Manual,
            100,
            "manual",
        );
        let automatic = seed_central_backup_kind(
            &backup_root,
            &root.join("Automatic.md"),
            BackupKind::Automatic,
            200,
            "automatic",
        );
        let source = root.join("New.md");
        std::fs::write(&source, "new automatic").unwrap();
        let new_bucket = central_backup_dir_for_source(&backup_root, &source);
        let mut settings = test_backup_settings();
        settings.max_total_files = 1;

        let error = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(300),
            &settings,
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::StorageFull);
        assert!(manual.exists());
        assert!(automatic.exists());
        assert!(!new_bucket.exists());
        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 2);
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "new automatic");

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_byte_capacity_failure_preserves_backups_without_partial_cleanup() {
        let root = temporary_test_dir("automatic-byte-capacity-no-partial-cleanup");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let manual = seed_central_backup_kind(
            &backup_root,
            &root.join("Manual.md"),
            BackupKind::Manual,
            100,
            "manual",
        );
        let automatic = seed_central_backup_kind(
            &backup_root,
            &root.join("Automatic.md"),
            BackupKind::Automatic,
            200,
            "aa",
        );
        let source = root.join("New.md");
        std::fs::write(&source, "12345").unwrap();
        let new_bucket = central_backup_dir_for_source(&backup_root, &source);
        let mut settings = test_backup_settings();
        settings.max_total_files = 10;
        settings.max_total_bytes = 10;

        let error = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(300),
            &settings,
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::StorageFull);
        assert!(manual.exists());
        assert!(automatic.exists());
        assert!(!new_bucket.exists());
        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 2);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_capacity_preflight_evicts_automatic_before_manual() {
        let root = temporary_test_dir("automatic-capacity-preserves-manual");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let manual = seed_central_backup_kind(
            &backup_root,
            &root.join("Manual.md"),
            BackupKind::Manual,
            100,
            "manual",
        );
        let old_automatic = seed_central_backup_kind(
            &backup_root,
            &root.join("Automatic.md"),
            BackupKind::Automatic,
            200,
            "old automatic",
        );
        let source = root.join("New.md");
        std::fs::write(&source, "new automatic").unwrap();
        let mut settings = test_backup_settings();
        settings.max_total_files = 2;

        let new_automatic = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(300),
            &settings,
        )
        .unwrap()
        .unwrap();

        assert!(manual.exists());
        assert!(!old_automatic.exists());
        assert!(new_automatic.exists());
        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 2);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_capacity_preflight_discards_manual_partial_without_evicting_manual() {
        let root = temporary_test_dir("automatic-capacity-cleans-manual-partial");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let manual = seed_central_backup_kind(
            &backup_root,
            &root.join("Manual.md"),
            BackupKind::Manual,
            100,
            "manual",
        );
        let partial_source = root.join("Partial.md");
        let partial_bucket = central_backup_dir_for_source(&backup_root, &partial_source);
        std::fs::create_dir_all(&partial_bucket).unwrap();
        let partial = partial_bucket.join(format!(
            ".{}manual.150.bak.partial",
            backup_prefix_for_source(&partial_source)
        ));
        std::fs::write(&partial, "partial manual").unwrap();
        let source = root.join("New.md");
        std::fs::write(&source, "new automatic").unwrap();
        let mut settings = test_backup_settings();
        settings.max_total_files = 2;

        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 2);
        let new_automatic = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(300),
            &settings,
        )
        .unwrap()
        .unwrap();

        assert!(manual.exists());
        assert!(!partial.exists());
        assert!(new_automatic.exists());
        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 2);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn manual_capacity_preflight_can_rotate_manual_backups() {
        let root = temporary_test_dir("manual-capacity-rotation");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let old_manual = seed_central_backup_kind(
            &backup_root,
            &root.join("Old.md"),
            BackupKind::Manual,
            100,
            "old manual",
        );
        let source = root.join("New.md");
        std::fs::write(&source, "new manual").unwrap();
        let mut settings = test_backup_settings();
        settings.max_total_files = 1;

        let new_manual = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(200),
            &settings,
        )
        .unwrap()
        .unwrap();

        assert!(!old_manual.exists());
        assert!(new_manual.exists());
        assert_eq!(scan_all_central_backups(&backup_root).unwrap().len(), 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_request_does_not_apply_tightened_manual_per_source_limit() {
        let root = temporary_test_dir("automatic-keeps-manual-source-pool");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let first_manual = seed_central_backup_kind(
            &backup_root,
            &source,
            BackupKind::Manual,
            100,
            "first manual",
        );
        let second_manual = seed_central_backup_kind(
            &backup_root,
            &source,
            BackupKind::Manual,
            200,
            "second manual",
        );
        std::fs::write(&source, "automatic").unwrap();
        let mut settings = test_backup_settings();
        settings.manual_versions_per_file = 1;
        settings.max_total_files = 10;

        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            UNIX_EPOCH + Duration::from_secs(300),
            &settings,
        )
        .unwrap();

        assert!(first_manual.exists());
        assert!(second_manual.exists());
        let backups = scan_central_backup_dir(&central_backup_dir_for_source(&backup_root, &source)).unwrap();
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Manual)
                .count(),
            2
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn manual_backups_are_never_throttled() {
        let root = temporary_test_dir("manual-backups");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let now = UNIX_EPOCH + Duration::from_secs(2_000_000);
        let settings = test_backup_settings();
        std::fs::write(&source, "first").unwrap();

        let first = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            now,
            &settings,
        )
        .unwrap()
        .unwrap();
        std::fs::write(&source, "second").unwrap();
        let second = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            now,
            &settings,
        )
        .unwrap()
        .unwrap();

        assert_ne!(first, second);
        let automatic = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            now + Duration::from_secs(1),
            &settings,
        )
        .unwrap()
        .unwrap();
        assert_ne!(automatic, second);
        let backups = scan_central_backup_dir(first.parent().unwrap()).unwrap();
        assert_eq!(backups.len(), 3);
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Manual)
                .count(),
            2
        );
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Automatic)
                .count(),
            1
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn manual_backups_retire_an_older_rolling_previous_version() {
        let root = temporary_test_dir("manual-retires-previous");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let start = UNIX_EPOCH + Duration::from_secs(2_500_000);
        let settings = test_backup_settings();
        std::fs::write(&source, "version one").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            start,
            &settings,
        )
        .unwrap();
        std::fs::write(&source, "version two").unwrap();
        backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Automatic,
            start + Duration::from_secs(60),
            &settings,
        )
        .unwrap();
        std::fs::write(&source, "version three").unwrap();
        let manual = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            start + Duration::from_secs(120),
            &settings,
        )
        .unwrap()
        .unwrap();

        assert_eq!(std::fs::read_to_string(&manual).unwrap(), "version three");
        let backups = scan_central_backup_dir(manual.parent().unwrap()).unwrap();
        assert!(backups
            .iter()
            .all(|backup| backup.kind != BackupKind::Previous));
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Manual)
                .count(),
            1
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn per_source_cleanup_limits_automatic_and_manual_backups() {
        let root = temporary_test_dir("source-backup-cleanup");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        let start = UNIX_EPOCH + Duration::from_secs(3_000_000);
        let mut settings = test_backup_settings();
        settings.checkpoint_interval = Duration::ZERO;
        settings.automatic_versions_per_file = 2;
        settings.manual_versions_per_file = 2;
        settings.max_total_files = 100;
        settings.max_total_bytes = 1_000_000;
        settings.automatic_retention = Duration::from_secs(10_000);

        for (offset, kind) in [
            RequestedBackupKind::Manual,
            RequestedBackupKind::Automatic,
            RequestedBackupKind::Automatic,
            RequestedBackupKind::Manual,
            RequestedBackupKind::Automatic,
            RequestedBackupKind::Manual,
        ]
        .into_iter()
        .enumerate()
        {
            std::fs::write(&source, format!("version {offset}")).unwrap();
            backup_existing_file_at(
                &backup_roots,
                &source,
                kind,
                start + Duration::from_secs(offset as u64),
                &settings,
            )
            .unwrap();
        }

        let backups = scan_central_backup_dir(&central_backup_dir_for_source(&backup_root, &source)).unwrap();
        assert_eq!(backups.len(), 4);
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BackupKind::Automatic)
                .count(),
            2
        );
        assert!(backups.iter().all(|backup| {
            backup.created_ns >= system_time_nanoseconds(start + Duration::from_secs(2))
        }));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn per_source_pool_limits_are_enforced_across_all_readable_roots() {
        let root = temporary_test_dir("cross-root-source-cleanup");
        let active_root = root.join("active").join("backups-v1");
        let previous_root = root.join("previous").join("backups-v1");
        let source = root.join("Draft.md");
        let old_previous = seed_central_backup_kind(
            &active_root,
            &source,
            BackupKind::Previous,
            100,
            "old previous",
        );
        let new_previous = seed_central_backup_kind(
            &previous_root,
            &source,
            BackupKind::Previous,
            200,
            "new previous",
        );
        let old_automatic = seed_central_backup_kind(
            &active_root,
            &source,
            BackupKind::Automatic,
            110,
            "old automatic",
        );
        let new_automatic = seed_central_backup_kind(
            &previous_root,
            &source,
            BackupKind::Automatic,
            210,
            "new automatic",
        );
        let old_manual = seed_central_backup_kind(
            &active_root,
            &source,
            BackupKind::Manual,
            120,
            "old manual",
        );
        let new_manual = seed_central_backup_kind(
            &previous_root,
            &source,
            BackupKind::Manual,
            220,
            "new manual",
        );
        let backup_roots = BackupRoots {
            active: active_root.clone(),
            readable: vec![active_root, previous_root],
        };
        let mut settings = test_backup_settings();
        settings.automatic_versions_per_file = 1;
        settings.manual_versions_per_file = 1;
        settings.max_total_files = 100;
        settings.automatic_retention = Duration::from_secs(10_000);

        cleanup_central_backups(
            &backup_roots,
            &source,
            None,
            system_time_nanoseconds(UNIX_EPOCH + Duration::from_secs(300)),
            true,
            &settings,
        )
        .unwrap();

        assert!(!old_previous.exists());
        assert!(new_previous.exists());
        assert!(!old_automatic.exists());
        assert!(new_automatic.exists());
        assert!(!old_manual.exists());
        assert!(new_manual.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn global_cleanup_enforces_age_count_and_size_while_protecting_new_backup() {
        let root = temporary_test_dir("global-backup-cleanup");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let protected_source = root.join("protected").join("Draft.md");
        let old_source = root.join("old").join("Draft.md");
        let middle_source = root.join("middle").join("Draft.md");
        let newest_source = root.join("newest").join("Draft.md");
        let protected = seed_central_backup(&backup_root, &protected_source, 700, "aaa");
        let old = seed_central_backup(&backup_root, &old_source, 800, "bbb");
        let middle = seed_central_backup(&backup_root, &middle_source, 950, "ccc");
        let newest = seed_central_backup(&backup_root, &newest_source, 990, "ddd");
        let mut settings = test_backup_settings();
        settings.max_total_files = 2;
        settings.max_total_bytes = 6;
        settings.automatic_retention = Duration::from_secs(100);

        cleanup_central_backups(
            &backup_roots,
            &protected_source,
            Some(&protected),
            system_time_nanoseconds(UNIX_EPOCH + Duration::from_secs(1_000)),
            true,
            &settings,
        )
        .unwrap();

        assert!(protected.exists());
        assert!(!old.exists());
        assert!(!middle.exists());
        assert!(newest.exists());
        let remaining = scan_all_central_backups(&backup_root).unwrap();
        assert_eq!(remaining.len(), 2);
        assert_eq!(remaining.iter().map(|backup| backup.size).sum::<u64>(), 6);
        assert!(!old.parent().unwrap().exists());
        assert!(!middle.parent().unwrap().exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn global_cleanup_spans_previous_roots_and_removes_manual_versions_last() {
        let root = temporary_test_dir("global-backup-priority");
        let active_root = root.join("active").join("backups-v1");
        let previous_root = root.join("previous").join("backups-v1");
        let automatic = seed_central_backup_kind(
            &active_root,
            &root.join("automatic.md"),
            BackupKind::Automatic,
            900,
            "auto",
        );
        let previous = seed_central_backup_kind(
            &previous_root,
            &root.join("previous.md"),
            BackupKind::Previous,
            100,
            "previous",
        );
        let manual = seed_central_backup_kind(
            &previous_root,
            &root.join("manual.md"),
            BackupKind::Manual,
            50,
            "manual",
        );
        let backup_roots = BackupRoots {
            active: active_root.clone(),
            readable: vec![active_root, previous_root],
        };
        let mut settings = test_backup_settings();
        settings.max_total_files = 1;
        settings.max_total_bytes = 1_000_000;

        enforce_global_backup_limits(&backup_roots, 0, 0, None, true, &settings).unwrap();

        assert!(!automatic.exists());
        assert!(!previous.exists());
        assert!(manual.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn listing_and_validation_support_legacy_backups_but_reject_other_paths() {
        let root = temporary_test_dir("legacy-backup-compatibility");
        let backup_root = root.join("app-data").join("backups-v1");
        let source = root.join("notes").join("Draft.md");
        let settings = test_backup_settings();
        let backup_roots = test_backup_roots(&backup_root);
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, "current").unwrap();
        let central = backup_existing_file_at(
            &backup_roots,
            &source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(4_000_000),
            &settings,
        )
        .unwrap()
        .unwrap();
        let legacy_dir = legacy_backup_dir_for_source(&source);
        std::fs::create_dir_all(&legacy_dir).unwrap();
        let legacy = legacy_dir.join(format!("{}123.bak", backup_prefix_for_source(&source)));
        std::fs::write(&legacy, "legacy").unwrap();

        let listed = list_backups_for_source(&backup_roots, &source).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|backup| backup.kind == Some(BackupKind::Manual)));
        assert!(listed.iter().any(|backup| backup.kind.is_none()));
        assert!(validate_backup_path(
            &backup_roots,
            &source,
            central.to_string_lossy().to_string()
        )
        .is_ok());
        assert!(validate_backup_path(
            &backup_roots,
            &source,
            legacy.to_string_lossy().to_string()
        )
        .is_ok());

        let outside = root.join(format!("{}999.bak", backup_prefix_for_source(&source)));
        std::fs::write(&outside, "outside").unwrap();
        assert_eq!(
            validate_backup_path(
                &backup_roots,
                &source,
                outside.to_string_lossy().to_string()
            )
            .unwrap_err(),
            "Backup is outside the current file backup folder."
        );

        let other_source = root.join("other").join("Draft.md");
        std::fs::create_dir_all(other_source.parent().unwrap()).unwrap();
        std::fs::write(&other_source, "other").unwrap();
        let other_backup = backup_existing_file_at(
            &backup_roots,
            &other_source,
            RequestedBackupKind::Manual,
            UNIX_EPOCH + Duration::from_secs(4_000_001),
            &settings,
        )
        .unwrap()
        .unwrap();
        assert!(validate_backup_path(
            &backup_roots,
            &source,
            other_backup.to_string_lossy().to_string()
        )
        .is_err());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn merged_backup_listing_keeps_all_legacy_files() {
        let root = temporary_test_dir("backup-list-limit");
        let backup_root = root.join("app-data").join("backups-v1");
        let backup_roots = test_backup_roots(&backup_root);
        let source = root.join("Draft.md");
        std::fs::write(&source, "current").unwrap();
        let legacy_dir = legacy_backup_dir_for_source(&source);
        std::fs::create_dir_all(&legacy_dir).unwrap();
        for index in 0..60 {
            std::fs::write(
                legacy_dir.join(format!("{}{index}.bak", backup_prefix_for_source(&source))),
                format!("legacy {index}"),
            )
            .unwrap();
        }

        assert_eq!(list_backups_for_source(&backup_roots, &source).unwrap().len(), 60);
        assert_eq!(std::fs::read_dir(&legacy_dir).unwrap().count(), 60);

        std::fs::remove_dir_all(root).unwrap();
    }

    fn seed_central_backup(
        backup_root: &Path,
        source_path: &Path,
        created_seconds: u64,
        content: &str,
    ) -> PathBuf {
        seed_central_backup_kind(
            backup_root,
            source_path,
            BackupKind::Manual,
            created_seconds,
            content,
        )
    }

    fn seed_central_backup_kind(
        backup_root: &Path,
        source_path: &Path,
        kind: BackupKind,
        created_seconds: u64,
        content: &str,
    ) -> PathBuf {
        std::fs::create_dir_all(source_path.parent().unwrap()).unwrap();
        std::fs::write(source_path, content).unwrap();
        let backup_dir = central_backup_dir_for_source(backup_root, source_path);
        std::fs::create_dir_all(&backup_dir).unwrap();
        create_central_backup(
            &backup_dir,
            source_path,
            kind,
            UNIX_EPOCH + Duration::from_secs(created_seconds),
            file_stats_for(source_path).unwrap(),
        )
        .unwrap()
        .0
    }

    fn test_backup_settings() -> BackupSettings {
        BackupSettings {
            directory: None,
            previous_directories: Vec::new(),
            checkpoint_interval: Duration::from_secs(10 * 60),
            automatic_versions_per_file: 48,
            manual_versions_per_file: 32,
            max_total_files: 2_048,
            max_total_bytes: 2_048 * MIB,
            max_backup_file_bytes: 256 * MIB,
            automatic_retention: Duration::from_secs(180 * 24 * 60 * 60),
            orphan_retention: Duration::from_secs(365 * 24 * 60 * 60),
        }
    }

    fn test_backup_roots(active: &Path) -> BackupRoots {
        BackupRoots {
            active: active.to_path_buf(),
            readable: vec![active.to_path_buf()],
        }
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
        .manage(BackupOperationLock::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_build_info,
            create_markdown_file,
            delete_markdown_backup_history,
            existing_markdown_file_stats,
            initial_markdown_file_paths,
            take_secondary_instance_markdown_paths,
            pick_html_export_path,
            pick_local_image_files,
            pick_markdown_backup_directory,
            pick_markdown_files,
            pick_markdown_save_path,
            pick_markdown_workspace,
            read_app_state_file,
            read_markdown_file,
            read_markdown_backup,
            reveal_markdown_file,
            list_markdown_backup_histories,
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
