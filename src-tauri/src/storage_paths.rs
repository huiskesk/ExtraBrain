use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Clone, Debug)]
pub struct StoragePaths {
    pub data_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub document_dir: Option<PathBuf>,
    pub legacy_local_data_dir: Option<PathBuf>,
    pub icloud_app_dir: Option<PathBuf>,
}

#[derive(Serialize)]
pub struct StorageRootsResponse {
    pub roots: Vec<String>,
}

pub fn resolve_storage_paths(app: &tauri::AppHandle) -> Result<StoragePaths, String> {
    let path = app.path();

    let app_data_dir = path
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    let document_dir = path.document_dir().ok();

    #[cfg(target_os = "macos")]
    {
        let home_dir = path
            .home_dir()
            .map_err(|e| format!("Failed to resolve home directory: {e}"))?;
        let legacy_local_data_dir = home_dir.join(".extrabrain");
        let icloud_root = home_dir
            .join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs");

        if icloud_root.exists() {
            let icloud_app_dir = icloud_root.join("ExtraBrain");
            // Keep iCloud support for migration compatibility only. If the existing
            // ExtraBrain folder is present, continue using it for existing users.
            if icloud_app_dir.exists() {
                return Ok(StoragePaths {
                    data_dir: icloud_app_dir.clone(),
                    app_data_dir,
                    document_dir,
                    legacy_local_data_dir: Some(legacy_local_data_dir),
                    icloud_app_dir: Some(icloud_app_dir),
                });
            }
        }

        return Ok(StoragePaths {
            data_dir: app_data_dir.clone(),
            app_data_dir,
            document_dir,
            legacy_local_data_dir: Some(legacy_local_data_dir),
            icloud_app_dir: None,
        });
    }

    #[cfg(target_os = "ios")]
    {
        // iOS must keep canonical data inside the app sandbox. Do not infer
        // iCloud or HOME-relative paths here.
        return Ok(StoragePaths {
            data_dir: app_data_dir.clone(),
            app_data_dir,
            document_dir,
            legacy_local_data_dir: None,
            icloud_app_dir: None,
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        Ok(StoragePaths {
            data_dir: app_data_dir.clone(),
            app_data_dir,
            document_dir,
            legacy_local_data_dir: None,
            icloud_app_dir: None,
        })
    }
}

pub fn storage_roots_response(paths: &StoragePaths) -> StorageRootsResponse {
    let mut roots = vec![
        paths.data_dir.to_string_lossy().to_string(),
        paths.app_data_dir.to_string_lossy().to_string(),
    ];

    if let Some(document_dir) = &paths.document_dir {
        roots.push(document_dir.to_string_lossy().to_string());
    }

    if let Some(legacy) = &paths.legacy_local_data_dir {
        roots.push(legacy.to_string_lossy().to_string());
    }
    if let Some(icloud) = &paths.icloud_app_dir {
        roots.push(icloud.to_string_lossy().to_string());
    }

    roots.sort();
    roots.dedup();

    StorageRootsResponse { roots }
}
