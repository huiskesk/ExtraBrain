use crate::AppState;
use crate::db::{
    CreateImportedNote, CreateNotebook, CreateNote, Note, Notebook, UpdateNote, UpdateNotebook,
};
use crate::sanitize::sanitize_html;
use crate::server_config;
use chrono::{DateTime, Utc};
use base64::Engine;
use quick_xml::de::from_str;
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

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
    rating: Option<i32>,
    tags: Option<Vec<String>>,
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
        rating: rating.unwrap_or(0),
        tags: tags.unwrap_or_default(),
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
    rating: Option<i32>,
    tags: Option<Vec<String>>,
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
        rating,
        tags,
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

#[derive(serde::Deserialize)]
struct EnexExport {
    #[serde(rename = "note", default)]
    notes: Vec<EnexNote>,
}

#[derive(serde::Deserialize)]
struct EnexNote {
    title: Option<String>,
    content: Option<String>,
    created: Option<String>,
    updated: Option<String>,
    #[serde(rename = "tag", default)]
    tags: Vec<String>,
    #[serde(rename = "resource", default)]
    resources: Vec<EnexResource>,
}

#[derive(serde::Deserialize)]
struct EnexResource {
    data: Option<EnexResourceData>,
    mime: Option<String>,
}

#[derive(serde::Deserialize)]
struct EnexResourceData {
    #[serde(rename = "$value")]
    value: String,
}

#[tauri::command]
pub fn import_enex(state: State<AppState>, file_path: String) -> Result<usize, String> {
    let file_name = Path::new(&file_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Imported Notes")
        .to_string();

    let file_contents =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let export: EnexExport =
        from_str(&file_contents).map_err(|e| format!("Failed to parse ENEX: {}", e))?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let attachments_dir = db.data_dir().join("attachments");
    std::fs::create_dir_all(&attachments_dir)
        .map_err(|e| format!("Failed to create attachments directory: {}", e))?;
    let notebook = db
        .create_notebook(CreateNotebook {
            name: file_name,
            color: None,
            icon: None,
        })
        .map_err(|e| e.to_string())?;

    let mut imported_count = 0;

    for note in export.notes {
        let title = note
            .title
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Untitled".to_string());
        let raw_content = note.content.unwrap_or_default();
        let media_map = extract_enex_resources(&note.resources, &attachments_dir);
        let cleaned_content = clean_enex_content(&raw_content, &media_map);
        let content = sanitize_html(&cleaned_content);

        let created_at = parse_enex_datetime(note.created.as_deref()).unwrap_or_else(current_time);
        let updated_at = parse_enex_datetime(note.updated.as_deref())
            .unwrap_or_else(|| created_at.clone());

        db.create_imported_note(CreateImportedNote {
            notebook_id: notebook.id.clone(),
            title,
            content,
            content_type: "html".to_string(),
            source_url: None,
            rating: 0,
            tags: note.tags,
            created_at,
            updated_at,
        })
        .map_err(|e| e.to_string())?;

        imported_count += 1;
    }

    Ok(imported_count)
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
    let localized_content = download_and_localize_images(sanitized_content);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_note(CreateNote {
        notebook_id,
        title,
        content: localized_content,
        content_type: "html".to_string(),
        source_url: Some(source_url),
        rating: 0,
        tags: Vec::new(),
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_tag(state: State<AppState>, note_id: String, tag_name: String) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_tag_to_note(&note_id, &tag_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_tag(state: State<AppState>, note_id: String, tag_name: String) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_tag_from_note(&note_id, &tag_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_tags(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_extension_token() -> String {
    server_config::extension_token().to_string()
}

#[tauri::command]
pub fn export_notes_to_directory(state: State<AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let notes = db.get_all_notes().map_err(|e| e.to_string())?;

    let export_dir = PathBuf::from(path);
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    for note in notes {
        let base_name = sanitize_filename(&note.title);
        let note_path = unique_file_path(&export_dir, &base_name, "md");
        let mut content = note.content.clone();

        if let Some(pdf_path) = &note.pdf_path {
            let assets_dir = export_dir.join("assets");
            std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

            let pdf_file_name = Path::new(pdf_path)
                .file_name()
                .and_then(|name| name.to_str())
                .map(sanitize_filename)
                .unwrap_or_else(|| "attachment.pdf".to_string());
            let pdf_pathbuf = Path::new(&pdf_file_name);
            let pdf_stem = pdf_pathbuf
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or("attachment");
            let pdf_extension = pdf_pathbuf
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("pdf");
            let pdf_export_name = format!("{}_{}", note.id, pdf_stem);
            let pdf_export_path = unique_file_path(&assets_dir, &pdf_export_name, pdf_extension);

            std::fs::copy(pdf_path, &pdf_export_path).map_err(|e| e.to_string())?;

            let relative_pdf_path = format!(
                "assets/{}",
                pdf_export_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("attachment.pdf")
            );

            if content.contains(pdf_path) {
                content = content.replace(pdf_path, &relative_pdf_path);
            } else if !content.contains(&relative_pdf_path) {
                content.push_str(&format!("\n\n[PDF Attachment]({})\n", relative_pdf_path));
            }
        }

        std::fs::write(&note_path, content).map_err(|e| e.to_string())?;
    }

    Ok(())
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

fn sanitize_filename(name: &str) -> String {
    let trimmed = name.trim();
    let fallback = if trimmed.is_empty() { "Untitled" } else { trimmed };
    let sanitized: String = fallback
        .chars()
        .map(|c| match c {
            '/' | '\\' | '?' | '%' | '*' | ':' | '|' | '"' | '<' | '>' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed
    }
}

fn unique_file_path(dir: &Path, base_name: &str, extension: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{}.{}", base_name, extension));
    if !candidate.exists() {
        return candidate;
    }

    let mut counter = 1;
    loop {
        let file_name = format!("{}-{}.{}", base_name, counter, extension);
        candidate = dir.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn current_time() -> String {
    Utc::now().to_rfc3339()
}

fn parse_enex_datetime(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    DateTime::parse_from_str(raw, "%Y%m%dT%H%M%SZ")
        .ok()
        .map(|dt| dt.with_timezone(&Utc).to_rfc3339())
}

struct MediaResource {
    path: String,
    mime: String,
}

fn extract_enex_resources(
    resources: &[EnexResource],
    attachments_dir: &Path,
) -> HashMap<String, MediaResource> {
    let mut media_map = HashMap::new();
    for resource in resources {
        let mime = match resource.mime.as_deref() {
            Some(mime) => mime.trim(),
            None => continue,
        };

        let extension = match mime {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "application/pdf" => "pdf",
            _ => continue,
        };

        let data = match resource.data.as_ref().map(|data| data.value.as_str()) {
            Some(value) => value,
            None => continue,
        };

        let encoded = data.split_whitespace().collect::<String>();
        let decoded = match base64::engine::general_purpose::STANDARD.decode(encoded) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };

        let hash = format!("{:x}", md5::compute(&decoded));
        let file_path = attachments_dir.join(format!("{}.{}", hash, extension));
        if !file_path.exists() {
            if std::fs::write(&file_path, &decoded).is_err() {
                continue;
            }
        }

        media_map.insert(
            hash,
            MediaResource {
                path: file_path.to_string_lossy().to_string(),
                mime: mime.to_string(),
            },
        );
    }
    media_map
}

fn clean_enex_content(raw: &str, media_map: &HashMap<String, MediaResource>) -> String {
    let xml_decl_re =
        Regex::new(r"(?s)<\?xml.*?\?>").expect("regex should compile: xml declaration");
    let doctype_re =
        Regex::new(r"(?s)<!DOCTYPE.*?>").expect("regex should compile: doctype");
    let en_note_re =
        Regex::new(r"(?is)</?en-note[^>]*>").expect("regex should compile: en-note tag");
    let hidden_div_re = Regex::new(
        r#"(?is)<div[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>.*?</div>"#,
    )
    .expect("regex should compile: hidden div");
    let en_media_re = Regex::new(r#"(?is)<en-media\b[^>]*>"#)
        .expect("regex should compile: en-media");
    let hash_re = Regex::new(r#"(?is)hash\s*=\s*["']([^"']+)["']"#)
        .expect("regex should compile: en-media hash");

    let mut cleaned = raw.to_string();
    cleaned = xml_decl_re.replace_all(&cleaned, "").to_string();
    cleaned = doctype_re.replace_all(&cleaned, "").to_string();
    cleaned = en_note_re.replace_all(&cleaned, "").to_string();
    cleaned = hidden_div_re.replace_all(&cleaned, "").to_string();
    cleaned = en_media_re
        .replace_all(&cleaned, |caps: &regex::Captures| {
            let tag = &caps[0];
            let hash = hash_re
                .captures(tag)
                .and_then(|capture| capture.get(1))
                .map(|value| value.as_str().to_lowercase());
            if let Some(hash) = hash {
                if let Some(media) = media_map.get(&hash) {
                    if media.mime.starts_with("image/") {
                        let asset_src = to_asset_src(&media.path);
                        return format!(r#"<img src="{}" />"#, asset_src);
                    }
                    if media.mime == "application/pdf" {
                        return format!(r#"<embed src="{}" type="application/pdf" style="width: 100%; min-height: 600px;" />"#, media.path);
                    }
                }
            }
            String::new()
        })
        .to_string();
    cleaned
}

fn download_and_localize_images(html_content: String) -> String {
    let img_regex =
        Regex::new(r#"(?is)<img\b[^>]*\bsrc\s*=\s*["'](https?://[^"'>\s]+)["'][^>]*>"#)
            .expect("regex should compile: img src");
    let mut cache: HashMap<String, String> = HashMap::new();

    img_regex
        .replace_all(&html_content, |caps: &regex::Captures| {
            let tag = caps.get(0).map(|m| m.as_str()).unwrap_or_default();
            let url = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            if let Some(local_path) = cache.get(url) {
                return tag.replace(url, local_path);
            }

            let local_path = match download_image_to_attachments(url) {
                Some(path) => {
                    cache.insert(url.to_string(), path.clone());
                    path
                }
                None => return tag.to_string(),
            };

            tag.replace(url, &local_path)
        })
        .to_string()
}

fn download_image_to_attachments(url: &str) -> Option<String> {
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let attachments_dir = PathBuf::from(home_dir).join(".extrabrain").join("attachments");
    if std::fs::create_dir_all(&attachments_dir).is_err() {
        return None;
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;
    let response = client.get(url).send().ok()?;
    if !response.status().is_success() {
        return None;
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_lowercase())?;

    let extension = match content_type.split(';').next().unwrap_or_default().trim() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => return None,
    };

    let image_bytes = response.bytes().ok()?;
    let filename = format!("{}.{}", Uuid::new_v4(), extension);
    let file_path = attachments_dir.join(filename);
    std::fs::write(&file_path, &image_bytes).ok()?;
    Some(file_path.to_string_lossy().to_string())
}

fn to_asset_src(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim_start_matches('/');
    format!("asset://localhost/{}", trimmed)
}
