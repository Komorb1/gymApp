use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::{log_activity, Db, DATABASE_FILE};
use crate::error::{AppError, AppResult};
use crate::session::{require_management, require_user, Sessions};

pub const AUTO_BACKUP_KEEP: i64 = 14;
pub const SCHEDULED_BACKUP_KIND: &str = "scheduled";
pub const MANUAL_BACKUP_KIND: &str = "manual";
pub const SAFETY_BACKUP_KIND: &str = "safety";

const PHOTOS_DIR: &str = "photos";
const INFO_FILE: &str = "backup.json";
const SCHEDULED_PREFIX: &str = "backup-";
const SAFETY_PREFIX: &str = "before-restore-";
const SCHEDULER_TICK_SECONDS: u64 = 60;
const FAILED_ATTEMPT_COOLDOWN_SECONDS: i64 = 30 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub name: String,
    pub kind: String,
    pub created_at: String,
    pub app_version: String,
    pub members: i64,
    pub memberships: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupSummary {
    #[serde(flatten)]
    pub info: BackupInfo,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupStatus {
    pub enabled: bool,
    pub time: String,
    pub folder: String,
    pub is_default_folder: bool,
    pub last_backup_at: Option<String>,
    pub last_backup_error: Option<String>,
    pub next_backup_at: Option<String>,
    pub keep: i64,
    pub current_members: i64,
    pub current_memberships: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreOutcome {
    pub restored: BackupSummary,
    pub safety_copy: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBackupSettingsInput {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub time: Option<String>,
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BackupSettings {
    pub enabled: bool,
    pub time: String,
    pub folder: Option<String>,
    pub last_backup_at: Option<String>,
    pub last_backup_error: Option<String>,
}

fn app_paths(app: &AppHandle) -> AppResult<(PathBuf, PathBuf, PathBuf)> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let database = app_data_dir.join(DATABASE_FILE);
    let photos = app_data_dir.join(PHOTOS_DIR);
    let default_root = app_data_dir.join("backups");
    Ok((database, photos, default_root))
}

fn resolve_backup_folder(settings: &BackupSettings, default_root: &Path) -> PathBuf {
    match settings.folder.as_deref() {
        Some(value) if !value.trim().is_empty() => PathBuf::from(value.trim()),
        _ => default_root.to_path_buf(),
    }
}

fn parse_backup_time(value: &str) -> AppResult<(u32, u32)> {
    let trimmed = value.trim();
    let mut parts = trimmed.split(':');
    let hour = parts
        .next()
        .and_then(|part| part.trim().parse::<u32>().ok());
    let minute = parts
        .next()
        .and_then(|part| part.trim().parse::<u32>().ok());
    match (hour, minute, parts.next()) {
        (Some(hour), Some(minute), None) if hour < 24 && minute < 60 => Ok((hour, minute)),
        _ => Err(AppError::Validation(
            "Backup time must be written as HH:MM".into(),
        )),
    }
}

fn format_backup_time(hour: u32, minute: u32) -> String {
    format!("{hour:02}:{minute:02}")
}

fn local_date_of(timestamp: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|value| value.with_timezone(&Local).date_naive())
}

fn tomorrow_at(now: DateTime<Local>, hour: u32, minute: u32) -> Option<DateTime<Local>> {
    let next_day = now.date_naive().succ_opt()?;
    next_day
        .and_hms_opt(hour, minute, 0)
        .and_then(|naive| Local.from_local_datetime(&naive).earliest())
}

fn today_at(now: DateTime<Local>, hour: u32, minute: u32) -> Option<DateTime<Local>> {
    now.date_naive()
        .and_hms_opt(hour, minute, 0)
        .and_then(|naive| Local.from_local_datetime(&naive).earliest())
}

pub fn backup_due(
    enabled: bool,
    time: &str,
    last_backup_at: Option<&str>,
    now: DateTime<Local>,
) -> bool {
    if !enabled {
        return false;
    }
    let Ok((hour, minute)) = parse_backup_time(time) else {
        return false;
    };
    let Some(scheduled) = today_at(now, hour, minute) else {
        return false;
    };
    if now < scheduled {
        return false;
    }
    match last_backup_at {
        Some(value) => local_date_of(value) != Some(now.date_naive()),
        None => true,
    }
}

pub fn next_backup_at(
    enabled: bool,
    time: &str,
    last_backup_at: Option<&str>,
    now: DateTime<Local>,
) -> Option<String> {
    if !enabled {
        return None;
    }
    let (hour, minute) = parse_backup_time(time).ok()?;
    let done_today = last_backup_at
        .and_then(local_date_of)
        .map(|date| date == now.date_naive())
        .unwrap_or(false);
    let next = if done_today {
        tomorrow_at(now, hour, minute)?
    } else {
        today_at(now, hour, minute)?
    };
    Some(
        next.with_timezone(&Utc)
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string(),
    )
}

fn unique_backup_path(root: &Path, prefix: &str, now: DateTime<Local>) -> PathBuf {
    let base = format!("{prefix}{}", now.format("%d-%m-%Y"));
    let plain = root.join(&base);
    if !plain.exists() {
        return plain;
    }
    let clock = root.join(format!("{base}-{}", now.format("%H%M")));
    if !clock.exists() {
        return clock;
    }
    let mut counter = 2;
    loop {
        let candidate = root.join(format!("{base}-{}-{counter}", now.format("%H%M")));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn backup_prefix(kind: &str) -> &'static str {
    if kind == SAFETY_BACKUP_KIND {
        SAFETY_PREFIX
    } else {
        SCHEDULED_PREFIX
    }
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(file_type) if file_type.is_dir() => directory_size(&entry.path()),
            Ok(_) => entry.metadata().map(|meta| meta.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

fn copy_directory(from: &Path, to: &Path) -> AppResult<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn read_info(directory: &Path) -> AppResult<BackupInfo> {
    let raw = fs::read_to_string(directory.join(INFO_FILE)).map_err(|_| {
        AppError::Validation("This folder does not hold a backup of this application".into())
    })?;
    serde_json::from_str(&raw)
        .map_err(|_| AppError::Validation("The backup information file is damaged".into()))
}

fn summarize(directory: &Path, info: BackupInfo) -> BackupSummary {
    BackupSummary {
        info,
        path: directory.to_string_lossy().to_string(),
        size_bytes: directory_size(directory),
    }
}

fn count_rows(conn: &Connection) -> AppResult<(i64, i64)> {
    let members: i64 = conn.query_row(
        "SELECT COUNT(*) FROM members WHERE is_deleted = 0",
        [],
        |row| row.get(0),
    )?;
    let memberships: i64 =
        conn.query_row("SELECT COUNT(*) FROM subscriptions", [], |row| row.get(0))?;
    Ok((members, memberships))
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn create_backup_in(
    conn: &Connection,
    root: &Path,
    photos: &Path,
    kind: &str,
    now: DateTime<Local>,
    app_version: &str,
) -> AppResult<BackupSummary> {
    fs::create_dir_all(root)?;
    let target = unique_backup_path(root, backup_prefix(kind), now);
    fs::create_dir_all(&target)?;
    match write_backup(conn, photos, &target, kind, now, app_version) {
        Ok(info) => Ok(summarize(&target, info)),
        Err(error) => {
            let _ = fs::remove_dir_all(&target);
            Err(error)
        }
    }
}

fn write_backup(
    conn: &Connection,
    photos: &Path,
    target: &Path,
    kind: &str,
    now: DateTime<Local>,
    app_version: &str,
) -> AppResult<BackupInfo> {
    let snapshot = target.join(DATABASE_FILE);
    conn.execute(
        "VACUUM INTO ?1",
        rusqlite::params![snapshot.to_string_lossy()],
    )?;
    if photos.is_dir() {
        copy_directory(photos, &target.join(PHOTOS_DIR))?;
    }
    let (members, memberships) = count_rows(conn)?;
    let info = BackupInfo {
        name: target
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default(),
        kind: kind.to_string(),
        created_at: now
            .with_timezone(&Utc)
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string(),
        app_version: app_version.to_string(),
        members,
        memberships,
    };
    fs::write(target.join(INFO_FILE), serde_json::to_string_pretty(&info)?)?;
    Ok(info)
}

pub(crate) fn validate_backup(directory: &Path) -> AppResult<BackupInfo> {
    if !directory.is_dir() {
        return Err(AppError::Validation(
            "The selected backup folder no longer exists".into(),
        ));
    }
    let info = read_info(directory)?;
    let snapshot = directory.join(DATABASE_FILE);
    if !snapshot.is_file() {
        return Err(AppError::Validation(
            "The backup database file is missing".into(),
        ));
    }
    let conn = Connection::open_with_flags(&snapshot, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| AppError::Validation("The backup database cannot be opened".into()))?;
    let integrity: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|_| AppError::Validation("The backup database cannot be read".into()))?;
    if integrity != "ok" {
        return Err(AppError::Validation(
            "The backup database is damaged and cannot be restored".into(),
        ));
    }
    let members_table: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'members'",
        [],
        |row| row.get(0),
    )?;
    if members_table == 0 {
        return Err(AppError::Validation(
            "This database was not created by this application".into(),
        ));
    }
    Ok(info)
}

pub(crate) fn list_backups_in(root: &Path) -> Vec<BackupSummary> {
    if let Ok(info) = read_info(root) {
        return vec![summarize(root, info)];
    }
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut backups: Vec<BackupSummary> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let path = entry.path();
            let info = read_info(&path).ok()?;
            Some(summarize(&path, info))
        })
        .collect();
    backups.sort_by(|left, right| right.info.created_at.cmp(&left.info.created_at));
    backups
}

pub(crate) fn prune_automatic_backups(root: &Path, keep: i64) -> Vec<PathBuf> {
    let mut removable: Vec<BackupSummary> = list_backups_in(root)
        .into_iter()
        .filter(|backup| {
            backup.info.kind == SCHEDULED_BACKUP_KIND || backup.info.kind == SAFETY_BACKUP_KIND
        })
        .collect();
    removable.sort_by(|left, right| right.info.created_at.cmp(&left.info.created_at));
    removable
        .into_iter()
        .skip(keep.max(0) as usize)
        .filter_map(|backup| {
            let path = PathBuf::from(&backup.path);
            fs::remove_dir_all(&path).ok().map(|_| path)
        })
        .collect()
}

fn remove_database_sidecars(database: &Path) {
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = database.as_os_str().to_os_string();
        sidecar.push(suffix);
        let _ = fs::remove_file(PathBuf::from(sidecar));
    }
}

fn stage_restore(source: &Path, app_data_dir: &Path) -> AppResult<(PathBuf, PathBuf)> {
    let staged_database = app_data_dir.join(format!("{DATABASE_FILE}.restoring"));
    let staged_photos = app_data_dir.join(format!("{PHOTOS_DIR}.restoring"));
    let _ = fs::remove_file(&staged_database);
    let _ = fs::remove_dir_all(&staged_photos);
    fs::copy(source.join(DATABASE_FILE), &staged_database)?;
    let source_photos = source.join(PHOTOS_DIR);
    fs::create_dir_all(&staged_photos)?;
    if source_photos.is_dir() {
        copy_directory(&source_photos, &staged_photos)?;
    }
    Ok((staged_database, staged_photos))
}

fn swap_into_place(
    app_data_dir: &Path,
    database: &Path,
    photos: &Path,
    staged_database: &Path,
    staged_photos: &Path,
) -> AppResult<()> {
    let previous_database = app_data_dir.join(format!("{DATABASE_FILE}.previous"));
    let previous_photos = app_data_dir.join(format!("{PHOTOS_DIR}.previous"));
    let _ = fs::remove_file(&previous_database);
    let _ = fs::remove_dir_all(&previous_photos);

    remove_database_sidecars(database);
    if database.exists() {
        fs::rename(database, &previous_database)?;
    }
    if let Err(error) = fs::rename(staged_database, database) {
        if previous_database.exists() {
            let _ = fs::rename(&previous_database, database);
        }
        return Err(error.into());
    }
    if photos.exists() {
        fs::rename(photos, &previous_photos)?;
    }
    if let Err(error) = fs::rename(staged_photos, photos) {
        if previous_photos.exists() {
            let _ = fs::rename(&previous_photos, photos);
        }
        return Err(error.into());
    }
    Ok(())
}

fn discard_previous(app_data_dir: &Path) {
    let _ = fs::remove_file(app_data_dir.join(format!("{DATABASE_FILE}.previous")));
    let _ = fs::remove_dir_all(app_data_dir.join(format!("{PHOTOS_DIR}.previous")));
}

fn rollback_previous(app_data_dir: &Path, database: &Path, photos: &Path) {
    let previous_database = app_data_dir.join(format!("{DATABASE_FILE}.previous"));
    let previous_photos = app_data_dir.join(format!("{PHOTOS_DIR}.previous"));
    remove_database_sidecars(database);
    if previous_database.exists() {
        let _ = fs::remove_file(database);
        let _ = fs::rename(&previous_database, database);
    }
    if previous_photos.exists() {
        let _ = fs::remove_dir_all(photos);
        let _ = fs::rename(&previous_photos, photos);
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn perform_restore(
    conn: &mut Connection,
    app_data_dir: &Path,
    database: &Path,
    photos: &Path,
    backup_root: &Path,
    source: &Path,
    now: DateTime<Local>,
    app_version: &str,
) -> AppResult<RestoreOutcome> {
    let info = validate_backup(source)?;
    let safety = create_backup_in(
        conn,
        backup_root,
        photos,
        SAFETY_BACKUP_KIND,
        now,
        app_version,
    )?;
    let (staged_database, staged_photos) = stage_restore(source, app_data_dir)?;

    let placeholder = Connection::open_in_memory()?;
    let live = std::mem::replace(conn, placeholder);
    drop(live);

    if let Err(error) = swap_into_place(
        app_data_dir,
        database,
        photos,
        &staged_database,
        &staged_photos,
    ) {
        rollback_previous(app_data_dir, database, photos);
        let _ = fs::remove_file(&staged_database);
        let _ = fs::remove_dir_all(&staged_photos);
        *conn = crate::db::open(database)?;
        return Err(error);
    }

    match crate::db::open(database) {
        Ok(opened) => {
            *conn = opened;
            discard_previous(app_data_dir);
        }
        Err(error) => {
            rollback_previous(app_data_dir, database, photos);
            *conn = crate::db::open(database)?;
            return Err(error);
        }
    }

    let restored = summarize(source, info);
    Ok(RestoreOutcome {
        restored,
        safety_copy: Some(safety.info.name),
    })
}

fn backup_settings(conn: &Connection) -> AppResult<BackupSettings> {
    conn.query_row(
        "SELECT backup_enabled, backup_time, backup_folder, last_backup_at, last_backup_error
         FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(BackupSettings {
                enabled: row.get::<_, i64>(0)? != 0,
                time: row.get(1)?,
                folder: row.get(2)?,
                last_backup_at: row.get(3)?,
                last_backup_error: row.get(4)?,
            })
        },
    )
    .map_err(AppError::Sqlite)
}

fn mark_backup_success(conn: &Connection, ran_at: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE settings SET last_backup_at = ?1, last_backup_error = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = 1",
        rusqlite::params![ran_at],
    )?;
    Ok(())
}

fn mark_backup_failure(conn: &Connection, message: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE settings SET last_backup_error = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = 1",
        rusqlite::params![message],
    )?;
    Ok(())
}

fn run_backup(
    conn: &Connection,
    root: &Path,
    photos: &Path,
    kind: &str,
    now: DateTime<Local>,
) -> AppResult<BackupSummary> {
    let summary = create_backup_in(conn, root, photos, kind, now, env!("CARGO_PKG_VERSION"))?;
    prune_automatic_backups(root, AUTO_BACKUP_KEEP);
    Ok(summary)
}

fn scheduled_backup_if_due(app: &AppHandle) -> AppResult<bool> {
    let db = app.state::<Db>();
    let (_, photos, default_root) = app_paths(app)?;
    db.with_conn(|conn| {
        let settings = backup_settings(conn)?;
        if !backup_due(
            settings.enabled,
            &settings.time,
            settings.last_backup_at.as_deref(),
            Local::now(),
        ) {
            return Ok(false);
        }
        let root = resolve_backup_folder(&settings, &default_root);
        match run_backup(conn, &root, &photos, SCHEDULED_BACKUP_KIND, Local::now()) {
            Ok(_) => {
                mark_backup_success(conn, &Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string())?;
                Ok(true)
            }
            Err(error) => {
                let _ = mark_backup_failure(conn, &error.to_string());
                Err(error)
            }
        }
    })
}

pub fn spawn_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        let mut failed_attempt_at: Option<DateTime<Utc>> = None;
        loop {
            let cooling_down = failed_attempt_at
                .map(|attempt| {
                    (Utc::now() - attempt).num_seconds() < FAILED_ATTEMPT_COOLDOWN_SECONDS
                })
                .unwrap_or(false);
            if !cooling_down {
                match scheduled_backup_if_due(&app) {
                    Ok(_) => failed_attempt_at = None,
                    Err(error) => {
                        eprintln!("[backup] scheduled backup failed: {error}");
                        failed_attempt_at = Some(Utc::now());
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(SCHEDULER_TICK_SECONDS));
        }
    });
}

#[tauri::command]
pub async fn get_backup_status(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<BackupStatus> {
    let (_, _, default_root) = app_paths(&app)?;
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let settings = backup_settings(conn)?;
        let folder = resolve_backup_folder(&settings, &default_root);
        let is_default_folder = settings
            .folder
            .as_deref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true);
        let (current_members, current_memberships) = count_rows(conn)?;
        Ok(BackupStatus {
            enabled: settings.enabled,
            time: settings.time.clone(),
            folder: folder.to_string_lossy().to_string(),
            is_default_folder,
            last_backup_at: settings.last_backup_at.clone(),
            last_backup_error: settings.last_backup_error.clone(),
            next_backup_at: next_backup_at(
                settings.enabled,
                &settings.time,
                settings.last_backup_at.as_deref(),
                Local::now(),
            ),
            keep: AUTO_BACKUP_KEEP,
            current_members,
            current_memberships,
        })
    })
}

#[tauri::command]
pub async fn update_backup_settings(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateBackupSettingsInput,
) -> AppResult<BackupStatus> {
    let (_, _, default_root) = app_paths(&app)?;
    let normalized_time = match input.time.as_deref() {
        Some(value) => {
            let (hour, minute) = parse_backup_time(value)?;
            Some(format_backup_time(hour, minute))
        }
        None => None,
    };
    let folder = match input.folder.as_deref() {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => {
            let path = PathBuf::from(value.trim());
            fs::create_dir_all(&path).map_err(|_| {
                AppError::Validation("The selected backup folder cannot be written to".into())
            })?;
            let probe = path.join(".gymapp-write-test");
            fs::write(&probe, b"ok").map_err(|_| {
                AppError::Validation("The selected backup folder cannot be written to".into())
            })?;
            let _ = fs::remove_file(&probe);
            Some(path.to_string_lossy().to_string())
        }
        None => None,
    };
    db.with_conn(|conn| {
        require_management(conn, &sessions, &session_token)?;
        let before = backup_settings(conn)?;
        let enabled = input.enabled.unwrap_or(before.enabled);
        let time = normalized_time.unwrap_or_else(|| before.time.clone());
        let stored_folder = match input.folder {
            Some(_) => folder,
            None => before.folder.clone(),
        };
        conn.execute(
            "UPDATE settings SET backup_enabled = ?1, backup_time = ?2, backup_folder = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = 1",
            rusqlite::params![enabled, time, stored_folder],
        )?;
        let settings = backup_settings(conn)?;
        let resolved = resolve_backup_folder(&settings, &default_root);
        let (current_members, current_memberships) = count_rows(conn)?;
        Ok(BackupStatus {
            enabled: settings.enabled,
            time: settings.time.clone(),
            folder: resolved.to_string_lossy().to_string(),
            is_default_folder: stored_folder.is_none(),
            last_backup_at: settings.last_backup_at.clone(),
            last_backup_error: settings.last_backup_error.clone(),
            next_backup_at: next_backup_at(
                settings.enabled,
                &settings.time,
                settings.last_backup_at.as_deref(),
                Local::now(),
            ),
            keep: AUTO_BACKUP_KEEP,
            current_members,
            current_memberships,
        })
    })
}

#[tauri::command]
pub async fn list_backups(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    folder: Option<String>,
) -> AppResult<Vec<BackupSummary>> {
    let (_, _, default_root) = app_paths(&app)?;
    let override_folder = folder
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let settings = backup_settings(conn)?;
        let root = override_folder
            .clone()
            .unwrap_or_else(|| resolve_backup_folder(&settings, &default_root));
        Ok(list_backups_in(&root))
    })
}

#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<BackupSummary> {
    let (_, photos, default_root) = app_paths(&app)?;
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let settings = backup_settings(conn)?;
        let root = resolve_backup_folder(&settings, &default_root);
        match run_backup(conn, &root, &photos, MANUAL_BACKUP_KIND, Local::now()) {
            Ok(summary) => {
                let _ =
                    mark_backup_success(conn, &Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string());
                Ok(summary)
            }
            Err(error) => {
                let _ = mark_backup_failure(conn, &error.to_string());
                Err(error)
            }
        }
    })
}

#[tauri::command]
pub async fn delete_backup(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    backup_path: String,
) -> AppResult<()> {
    let target = PathBuf::from(backup_path.trim());
    db.with_conn(|conn| {
        let actor_id = require_management(conn, &sessions, &session_token)?;
        let info = validate_backup(&target)?;
        fs::remove_dir_all(&target)?;
        let details = serde_json::to_string(&serde_json::json!({
            "backup": info.name,
            "members": info.members,
            "memberships": info.memberships,
        }))?;
        log_activity(
            conn,
            actor_id,
            "backup.delete",
            Some("backup"),
            None,
            None,
            Some(&details),
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    backup_path: String,
) -> AppResult<RestoreOutcome> {
    let app_data_dir = app.path().app_data_dir()?;
    let database = app_data_dir.join(DATABASE_FILE);
    let photos = app_data_dir.join(PHOTOS_DIR);
    let default_root = app_data_dir.join("backups");
    let source = PathBuf::from(backup_path.trim());
    db.with_conn(|conn| {
        let actor_id = require_management(conn, &sessions, &session_token)?;
        let settings = backup_settings(conn)?;
        let root = resolve_backup_folder(&settings, &default_root);
        let before = count_rows(conn).unwrap_or((0, 0));
        let outcome = perform_restore(
            conn,
            &app_data_dir,
            &database,
            &photos,
            &root,
            &source,
            Local::now(),
            env!("CARGO_PKG_VERSION"),
        )?;
        let actor_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM users WHERE id = ?1",
                rusqlite::params![actor_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if actor_exists {
            let before_json = serde_json::to_string(&serde_json::json!({
                "members": before.0,
                "memberships": before.1,
            }))
            .unwrap_or_default();
            let after_json = serde_json::to_string(&serde_json::json!({
                "members": outcome.restored.info.members,
                "memberships": outcome.restored.info.memberships,
                "backup": outcome.restored.info.name,
            }))
            .unwrap_or_default();
            let _ = log_activity(
                conn,
                actor_id,
                "backup.restore",
                Some("backup"),
                None,
                Some(&before_json),
                Some(&after_json),
            );
        }
        Ok(outcome)
    })
}

#[tauri::command]
pub async fn restart_app(app: AppHandle) -> AppResult<()> {
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    const VERSION: &str = "0.1.7";

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!(
                "gymapp-backup-{tag}-{}-{}",
                std::process::id(),
                Utc::now().timestamp_nanos_opt().unwrap_or_default()
            ));
            fs::create_dir_all(&path).unwrap();
            TempDir(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn at(hour: u32, minute: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 10, 13, hour, minute, 0)
            .unwrap()
    }

    fn utc_string(now: DateTime<Local>) -> String {
        now.with_timezone(&Utc)
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string()
    }

    fn open_database(app_data: &Path) -> Connection {
        fs::create_dir_all(app_data).unwrap();
        crate::db::open(&app_data.join(DATABASE_FILE)).unwrap()
    }

    fn add_member(conn: &Connection, first_name: &str, phone: &str) {
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES (?1, 'Test', ?2)",
            rusqlite::params![first_name, phone],
        )
        .unwrap();
    }

    fn member_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM members WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write_fake_backup(root: &Path, name: &str, kind: &str, created_at: &str) -> PathBuf {
        let path = root.join(name);
        fs::create_dir_all(&path).unwrap();
        let info = BackupInfo {
            name: name.to_string(),
            kind: kind.to_string(),
            created_at: created_at.to_string(),
            app_version: VERSION.to_string(),
            members: 1,
            memberships: 0,
        };
        fs::write(path.join(INFO_FILE), serde_json::to_string(&info).unwrap()).unwrap();
        path
    }

    #[test]
    fn a_fresh_database_gets_sensible_backup_defaults() {
        let dir = TempDir::new("defaults");
        let conn = open_database(dir.path());
        let settings = backup_settings(&conn).unwrap();

        assert!(settings.enabled);
        assert_eq!(settings.time, "20:00");
        assert!(settings.folder.is_none());
        assert!(settings.last_backup_at.is_none());
        assert!(settings.last_backup_error.is_none());
    }

    #[test]
    fn a_backup_time_must_be_a_clock_time() {
        assert_eq!(parse_backup_time("20:00").unwrap(), (20, 0));
        assert_eq!(parse_backup_time(" 8:5 ").unwrap(), (8, 5));
        assert_eq!(format_backup_time(8, 5), "08:05");
        assert!(parse_backup_time("24:00").is_err());
        assert!(parse_backup_time("20:70").is_err());
        assert!(parse_backup_time("evening").is_err());
        assert!(parse_backup_time("20:00:00").is_err());
    }

    #[test]
    fn backup_folders_are_named_after_the_day_and_disambiguated_by_time() {
        let dir = TempDir::new("naming");
        let root = dir.path();
        let now = at(18, 30);

        let first = unique_backup_path(root, SCHEDULED_PREFIX, now);
        assert_eq!(
            first.file_name().unwrap().to_string_lossy(),
            "backup-13-10-2026"
        );
        fs::create_dir_all(&first).unwrap();

        let second = unique_backup_path(root, SCHEDULED_PREFIX, now);
        assert_eq!(
            second.file_name().unwrap().to_string_lossy(),
            "backup-13-10-2026-1830"
        );
        fs::create_dir_all(&second).unwrap();

        let third = unique_backup_path(root, SCHEDULED_PREFIX, now);
        assert_eq!(
            third.file_name().unwrap().to_string_lossy(),
            "backup-13-10-2026-1830-2"
        );

        let safety = unique_backup_path(root, SAFETY_PREFIX, now);
        assert_eq!(
            safety.file_name().unwrap().to_string_lossy(),
            "before-restore-13-10-2026"
        );
    }

    #[test]
    fn a_scheduled_backup_runs_once_a_day_once_its_time_passes() {
        let now = at(20, 30);
        let done_today = utc_string(now);
        let done_yesterday = utc_string(now - Duration::days(1));

        assert!(backup_due(true, "20:00", None, now));
        assert!(!backup_due(false, "20:00", None, now));
        assert!(!backup_due(true, "21:00", None, now));
        assert!(!backup_due(true, "20:00", Some(&done_today), now));
        assert!(backup_due(true, "20:00", Some(&done_yesterday), now));
        assert!(!backup_due(true, "not-a-time", None, now));
    }

    #[test]
    fn the_next_backup_is_today_until_it_runs_and_tomorrow_afterwards() {
        let now = at(10, 0);
        let today = next_backup_at(true, "20:00", None, now).unwrap();
        assert_eq!(local_date_of(&today), Some(now.date_naive()));

        let ran_today = utc_string(now);
        let tomorrow = next_backup_at(true, "20:00", Some(&ran_today), now).unwrap();
        assert_eq!(
            local_date_of(&tomorrow),
            Some(now.date_naive().succ_opt().unwrap())
        );

        assert!(next_backup_at(false, "20:00", None, now).is_none());
    }

    #[test]
    fn a_backup_holds_the_database_the_photos_and_an_information_file() {
        let dir = TempDir::new("create");
        let root = dir.path().join("backups");
        let app_data = dir.path().join("data");
        let photos = app_data.join(PHOTOS_DIR);
        let conn = open_database(&app_data);
        add_member(&conn, "Amina", "971555000000");
        fs::create_dir_all(&photos).unwrap();
        fs::write(photos.join("member_1.jpg"), b"photo-bytes").unwrap();

        let created = create_backup_in(
            &conn,
            &root,
            &photos,
            MANUAL_BACKUP_KIND,
            at(9, 15),
            VERSION,
        )
        .unwrap();

        assert_eq!(created.info.name, "backup-13-10-2026");
        assert_eq!(created.info.kind, MANUAL_BACKUP_KIND);
        assert_eq!(created.info.members, 1);
        assert_eq!(created.info.memberships, 0);
        assert_eq!(created.info.app_version, VERSION);
        assert!(created.size_bytes > 0);

        let folder = PathBuf::from(&created.path);
        assert!(folder.join(INFO_FILE).is_file());
        assert!(folder.join(PHOTOS_DIR).join("member_1.jpg").is_file());
        let snapshot = Connection::open(folder.join(DATABASE_FILE)).unwrap();
        assert_eq!(member_count(&snapshot), 1);

        fs::create_dir_all(root.join("gym holiday photos")).unwrap();
        let listed = list_backups_in(&root);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].info.name, "backup-13-10-2026");
    }

    #[test]
    fn a_folder_that_is_itself_a_backup_is_listed_as_one() {
        let dir = TempDir::new("self-list");
        let folder = write_fake_backup(
            dir.path(),
            "backup-13-10-2026",
            MANUAL_BACKUP_KIND,
            "2026-10-13T17:00:00Z",
        );
        let listed = list_backups_in(&folder);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].info.name, "backup-13-10-2026");
    }

    #[test]
    fn backups_are_listed_newest_first() {
        let dir = TempDir::new("list");
        let root = dir.path().to_path_buf();
        write_fake_backup(
            &root,
            "backup-11-10-2026",
            SCHEDULED_BACKUP_KIND,
            "2026-10-11T17:00:00Z",
        );
        write_fake_backup(
            &root,
            "backup-13-10-2026",
            SCHEDULED_BACKUP_KIND,
            "2026-10-13T17:00:00Z",
        );
        write_fake_backup(
            &root,
            "backup-12-10-2026",
            MANUAL_BACKUP_KIND,
            "2026-10-12T09:00:00Z",
        );

        let names: Vec<String> = list_backups_in(&root)
            .into_iter()
            .map(|backup| backup.info.name)
            .collect();

        assert_eq!(
            names,
            vec![
                "backup-13-10-2026",
                "backup-12-10-2026",
                "backup-11-10-2026"
            ]
        );
    }

    #[test]
    fn only_automatic_backups_are_pruned() {
        let dir = TempDir::new("prune");
        let root = dir.path().to_path_buf();
        for day in 1..=5 {
            write_fake_backup(
                &root,
                &format!("backup-{day:02}-10-2026"),
                SCHEDULED_BACKUP_KIND,
                &format!("2026-10-{day:02}T17:00:00Z"),
            );
        }
        for day in 1..=2 {
            write_fake_backup(
                &root,
                &format!("before-restore-{day:02}-09-2026"),
                SAFETY_BACKUP_KIND,
                &format!("2026-09-{day:02}T17:00:00Z"),
            );
        }
        write_fake_backup(
            &root,
            "backup-01-08-2026",
            MANUAL_BACKUP_KIND,
            "2026-08-01T17:00:00Z",
        );
        write_fake_backup(
            &root,
            "backup-02-08-2026",
            MANUAL_BACKUP_KIND,
            "2026-08-02T17:00:00Z",
        );

        let removed = prune_automatic_backups(&root, 3);

        assert_eq!(removed.len(), 4);
        let remaining: Vec<String> = list_backups_in(&root)
            .into_iter()
            .map(|backup| backup.info.name)
            .collect();
        assert!(remaining.contains(&"backup-01-08-2026".to_string()));
        assert!(remaining.contains(&"backup-02-08-2026".to_string()));
        assert!(remaining.contains(&"backup-05-10-2026".to_string()));
        assert!(remaining.contains(&"backup-04-10-2026".to_string()));
        assert!(remaining.contains(&"backup-03-10-2026".to_string()));
        assert_eq!(remaining.len(), 5);
    }

    #[test]
    fn a_folder_that_is_not_a_backup_is_refused() {
        let dir = TempDir::new("invalid");
        let plain = dir.path().join("holiday-photos");
        fs::create_dir_all(&plain).unwrap();
        assert!(matches!(
            validate_backup(&plain).unwrap_err(),
            AppError::Validation(_)
        ));

        let damaged = write_fake_backup(
            dir.path(),
            "backup-13-10-2026",
            MANUAL_BACKUP_KIND,
            "2026-10-13T17:00:00Z",
        );
        assert!(validate_backup(&damaged).is_err());

        fs::write(damaged.join(DATABASE_FILE), b"not a database").unwrap();
        assert!(validate_backup(&damaged).is_err());
    }

    #[test]
    fn restoring_a_backup_returns_the_data_and_keeps_a_safety_copy() {
        let dir = TempDir::new("restore");
        let app_data = dir.path().join("data");
        let photos = app_data.join(PHOTOS_DIR);
        let root = dir.path().join("backups");
        let database = app_data.join(DATABASE_FILE);
        let mut conn = open_database(&app_data);
        add_member(&conn, "Amina", "971555000000");
        fs::create_dir_all(&photos).unwrap();
        fs::write(photos.join("member_1.jpg"), b"photo-bytes").unwrap();

        let created = create_backup_in(
            &conn,
            &root,
            &photos,
            MANUAL_BACKUP_KIND,
            at(9, 15),
            VERSION,
        )
        .unwrap();

        add_member(&conn, "Omar", "971555000001");
        fs::write(photos.join("member_2.jpg"), b"newer-photo").unwrap();
        assert_eq!(member_count(&conn), 2);

        let outcome = perform_restore(
            &mut conn,
            &app_data,
            &database,
            &photos,
            &root,
            Path::new(&created.path),
            at(10, 0),
            VERSION,
        )
        .unwrap();

        assert_eq!(member_count(&conn), 1);
        assert_eq!(outcome.restored.info.name, "backup-13-10-2026");
        let safety_name = outcome.safety_copy.unwrap();
        assert!(safety_name.starts_with(SAFETY_PREFIX));

        let safety = Connection::open(root.join(&safety_name).join(DATABASE_FILE)).unwrap();
        assert_eq!(member_count(&safety), 2);

        assert!(photos.join("member_1.jpg").is_file());
        assert!(!photos.join("member_2.jpg").exists());
        assert!(!app_data.join(format!("{DATABASE_FILE}.previous")).exists());
        assert!(!app_data.join(format!("{PHOTOS_DIR}.previous")).exists());
    }
}
