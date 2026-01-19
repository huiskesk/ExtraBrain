use crate::AppState;
use crate::db::{
    CreateNotebook, CreateNote, Note, Notebook, UpdateNote, UpdateNotebook,
};
use crate::sanitize::sanitize_html;
use crate::server_config;
use tauri::State;

// Notebook commands

#[tauri::command]
pub fn create_notebook(
    state: State<AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> Result<Notebook, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_notebook(CreateNotebook { name, color, icon })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_notebooks(state: State<AppState>) -> Result<Vec<Notebook>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_notebooks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_notebook(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    sort_order: Option<i32>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_notebook(UpdateNotebook {
        id,
        name,
        color,
        icon,
        sort_order,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_notebook(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_notebook(&id).map_err(|e| e.to_string())
}

// Note commands

#[tauri::command]
pub fn create_note(
    state: State<AppState>,
    notebook_id: String,
    title: String,
    mut content: String,
    content_type: String,
    source_url: Option<String>,
) -> Result<Note, String> {
    if content_type == "html" {
        content = sanitize_html(&content);
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_note(CreateNote {
        notebook_id,
        title,
        content,
        content_type,
        source_url,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_note(state: State<AppState>, id: String) -> Result<Note, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_note(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_notes_by_notebook(state: State<AppState>, notebook_id: String) -> Result<Vec<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_notes_by_notebook(&notebook_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    is_pinned: Option<bool>,
    is_archived: Option<bool>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let sanitized_content = if let Some(content) = content {
        let is_html_note = db
            .get_note(&id)
            .map(|note| note.content_type == "html")
            .unwrap_or(false);
        if is_html_note {
            Some(sanitize_html(&content))
        } else {
            Some(content)
        }
    } else {
        None
    };
    db.update_note(UpdateNote {
        id,
        title,
        content: sanitized_content,
        is_pinned,
        is_archived,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_note(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_note_to_notebook(
    state: State<AppState>,
    note_id: String,
    notebook_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.move_note_to_notebook(&note_id, &notebook_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_notes(state: State<AppState>, query: String) -> Result<Vec<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search_notes(&query).map_err(|e| e.to_string())
}

// PDF commands

#[tauri::command]
pub fn import_pdf(
    state: State<AppState>,
    notebook_id: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<Note, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.import_pdf(&notebook_id, &file_name, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pdf_data(state: State<AppState>, note_id: String) -> Result<Vec<u8>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_pdf_data(&note_id).map_err(|e| e.to_string())
}

// Web clip commands

#[tauri::command]
pub fn save_web_clip(
    state: State<AppState>,
    notebook_id: String,
    title: String,
    content: String,
    source_url: String,
) -> Result<Note, String> {
    let sanitized_content = sanitize_html(&content);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_note(CreateNote {
        notebook_id,
        title,
        content: sanitized_content,
        content_type: "html".to_string(),
        source_url: Some(source_url),
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_extension_token() -> String {
    server_config::extension_token().to_string()
}

// Image file handling for drag and drop

#[derive(serde::Serialize)]
pub struct ImageData {
    pub path: String,
    pub name: String,
    pub base64: String,
    pub mime_type: String,
}

#[tauri::command]
pub fn read_image_file(path: String) -> Result<ImageData, String> {
    use std::path::Path;
    use std::fs;

    let file_path = Path::new(&path);

    // Validate file exists
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    // Get file extension and validate it's an image
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let mime_type = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err(format!("Unsupported image format: {}", extension)),
    };

    // Get file name
    let name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();

    // Read file and check size (max 5MB)
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    if data.len() > 5 * 1024 * 1024 {
        return Err("Image file exceeds 5MB limit".to_string());
    }

    // Encode to base64
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let base64_data = STANDARD.encode(&data);
    let base64 = format!("data:{};base64,{}", mime_type, base64_data);

    Ok(ImageData {
        path,
        name,
        base64,
        mime_type: mime_type.to_string(),
    })
}
