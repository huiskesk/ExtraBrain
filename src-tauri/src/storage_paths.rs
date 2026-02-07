use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Clone, Debug)]
pub struct StoragePaths {
    pub data_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub app_document_dir: PathBuf,
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
    let app_document_dir = path
        .app_document_dir()
        .map_err(|e| format!("Failed to resolve app document directory: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        let home_dir = path
            .home_dir()
            .map_err(|e| format!("Failed to resolve home directory: {e}"))?;
        let icloud_root = home_dir
            .join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs");

        if icloud_root.exists() {
            let icloud_app_dir = icloud_root.join("ExtraBrain");
            return Ok(StoragePaths {
                data_dir: icloud_app_dir.clone(),
                app_data_dir,
                app_document_dir,
                legacy_local_data_dir: Some(home_dir.join(".extrabrain")),
                icloud_app_dir: Some(icloud_app_dir),
            });
        }

        return Ok(StoragePaths {
            data_dir: app_data_dir.clone(),
            app_data_dir,
            app_document_dir,
            legacy_local_data_dir: Some(home_dir.join(".extrabrain")),
            icloud_app_dir: None,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(StoragePaths {
            data_dir: app_data_dir.clone(),
            app_data_dir,
            app_document_dir,
            legacy_local_data_dir: None,
            icloud_app_dir: None,
        })
    }
}

pub fn storage_roots_response(paths: &StoragePaths) -> StorageRootsResponse {
    let mut roots = vec![
        paths.data_dir.to_string_lossy().to_string(),
        paths.app_data_dir.to_string_lossy().to_string(),
        paths.app_document_dir.to_string_lossy().to_string(),
    ];

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
