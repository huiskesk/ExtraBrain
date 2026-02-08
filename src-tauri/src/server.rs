// HTTP API Server for Chrome Extension communication
// Runs on http://localhost:3847

use axum::{
    extract::State,
    http::{header, Method, Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tower_http::cors::{AllowHeaders, AllowMethods, Any, CorsLayer};

use crate::db::{CreateNote, Database, Note, Notebook};
use crate::sanitize::sanitize_html;
use crate::server_config::extension_token;

// Shared state type for the HTTP server
pub type SharedDatabase = Arc<Mutex<Database>>;

// Combined state for Axum handlers (database + app handle for events)
#[derive(Clone)]
pub struct ServerState {
    pub db: SharedDatabase,
    pub app_handle: AppHandle,
    pub extension_token: String,
}

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

// Event payload sent to frontend when a note is created via HTTP API
#[derive(Debug, Clone, Serialize)]
pub struct NoteCreatedEvent {
    pub note: Note,
}

// Start the HTTP server
// This runs in a separate async task and doesn't block Tauri
pub async fn start_http_server(db: SharedDatabase, app_handle: AppHandle) {
    // Configure CORS to allow requests from Chrome extensions
    // Chrome extensions have origin like "chrome-extension://abcdef123456"
    let cors = CorsLayer::new()
        // Allow any origin (temporary for debugging)
        .allow_origin(Any)
        // Allow these HTTP methods
        .allow_methods(AllowMethods::list([
            Method::GET,
            Method::POST,
            Method::OPTIONS,
        ]))
        // Allow these headers
        .allow_headers(AllowHeaders::list([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
        ]));

    // Create combined state with database and app handle
    let state = ServerState {
        db,
        app_handle,
        extension_token: extension_token().to_string(),
    };

    // Build router with all endpoints
    let app = Router::new()
        // Health check endpoint
        .route("/health", get(health_check))
        // Notebook endpoints
        .route("/notebooks", get(get_notebooks))
        // Clip endpoints
        .route("/clips", post(save_clip))
        // Add shared state (database + app handle)
        .with_state(state.clone())
        // Add auth middleware
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        // Add CORS middleware
        .layer(cors);

    // Bind to localhost only (security: not accessible from network)
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3847")
        .await
        .expect("Failed to bind HTTP server to port 3847");

    println!("ExtraBrain HTTP API running on http://127.0.0.1:3847");

    // Run the server
    axum::serve(listener, app).await.expect("HTTP server error");
}

// GET /health - Simple health check
async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::ok("ExtraBrain is running".to_string()))
}

async fn auth_middleware(
    State(state): State<ServerState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if request.method() == Method::OPTIONS {
        return Ok(next.run(request).await);
    }

    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let expected = format!("Bearer {}", state.extension_token);

    if auth_header != Some(expected.as_str()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(request).await)
}

// GET /notebooks - Get all notebooks for the extension dropdown
async fn get_notebooks(
    State(state): State<ServerState>,
) -> Result<Json<Vec<Notebook>>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| {
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
    State(state): State<ServerState>,
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
    // We scope the lock so it's released before we emit the event
    let note = {
        let db = state.db.lock().map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::err(format!("Database lock error: {}", e))),
            )
        })?;

        let sanitized_content = sanitize_html(&payload.content);
        db.create_note(CreateNote {
            notebook_id: payload.notebook_id,
            title: payload.title,
            content: sanitized_content,
            content_type: "html".to_string(),
            source_url: payload.source_url,
            rating: 0,
            tags: Vec::new(),
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::err(format!("Failed to save clip: {}", e))),
            )
        })?
    }; // db lock is released here

    println!("Saved web clip: {}", note.title);

    // Emit event to frontend so it can update the UI in real-time
    // The frontend listens for "note-created" events
    let event_payload = NoteCreatedEvent { note: note.clone() };

    if let Err(e) = state.app_handle.emit("note-created", event_payload) {
        // Log error but don't fail the request - the clip was saved successfully
        eprintln!("Failed to emit note-created event: {}", e);
    } else {
        println!("Emitted note-created event to frontend");
    }

    Ok(Json(ApiResponse::ok(note)))
}
