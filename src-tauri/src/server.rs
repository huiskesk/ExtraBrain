// HTTP API Server for Chrome Extension communication
// Runs on http://localhost:3847

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

use crate::db::{CreateNote, Database, Note, Notebook};

// Shared state type for the HTTP server
pub type SharedDatabase = Arc<Mutex<Database>>;

// Request/Response types for the API

#[derive(Debug, Deserialize)]
pub struct SaveClipRequest {
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: String) -> ApiResponse<T> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

// Start the HTTP server
// This runs in a separate async task and doesn't block Tauri
pub async fn start_http_server(db: SharedDatabase) {
    // Configure CORS to allow requests from Chrome extensions
    // Chrome extensions have origin like "chrome-extension://abcdef123456"
    let cors = CorsLayer::new()
        // Allow any origin (includes chrome-extension://)
        .allow_origin(Any)
        // Allow these HTTP methods
        .allow_methods(Any)
        // Allow these headers
        .allow_headers(Any);

    // Build router with all endpoints
    let app = Router::new()
        // Health check endpoint
        .route("/health", get(health_check))
        // Notebook endpoints
        .route("/notebooks", get(get_notebooks))
        // Clip endpoints
        .route("/clips", post(save_clip))
        // Add shared database state
        .with_state(db)
        // Add CORS middleware
        .layer(cors);

    // Bind to localhost only (security: not accessible from network)
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3847")
        .await
        .expect("Failed to bind HTTP server to port 3847");

    println!("ExtraBrain HTTP API running on http://127.0.0.1:3847");

    // Run the server
    axum::serve(listener, app)
        .await
        .expect("HTTP server error");
}

// GET /health - Simple health check
async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::ok("ExtraBrain is running".to_string()))
}

// GET /notebooks - Get all notebooks for the extension dropdown
async fn get_notebooks(
    State(db): State<SharedDatabase>,
) -> Result<Json<Vec<Notebook>>, (StatusCode, String)> {
    let db = db.lock().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database lock error: {}", e),
        )
    })?;

    let notebooks = db.get_all_notebooks().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )
    })?;

    Ok(Json(notebooks))
}

// POST /clips - Save a web clip from the Chrome extension
async fn save_clip(
    State(db): State<SharedDatabase>,
    Json(payload): Json<SaveClipRequest>,
) -> Result<Json<ApiResponse<Note>>, (StatusCode, Json<ApiResponse<Note>>)> {
    // Validate required fields
    if payload.title.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err("Title is required".to_string())),
        ));
    }

    if payload.notebook_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err("Notebook ID is required".to_string())),
        ));
    }

    // Lock database and create note
    let db = db.lock().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Database lock error: {}", e))),
        )
    })?;

    let note = db
        .create_note(CreateNote {
            notebook_id: payload.notebook_id,
            title: payload.title,
            content: payload.content,
            content_type: "html".to_string(),
            source_url: payload.source_url,
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::err(format!("Failed to save clip: {}", e))),
            )
        })?;

    println!("Saved web clip: {}", note.title);

    Ok(Json(ApiResponse::ok(note)))
}
