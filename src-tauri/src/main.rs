// ExtraBrain - A modern note-taking app
// Main entry point for the Tauri application

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod db;
mod server;

use db::Database;
use std::sync::{Arc, Mutex};
use tauri::Manager;

// Application state shared between Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
}

fn main() {
    // Initialize the database for Tauri commands
    let db = Database::new().expect("Failed to initialize database");

    // Create shared database reference for HTTP server
    // Arc = Atomic Reference Counting (thread-safe shared ownership)
    // Mutex = Mutual Exclusion (thread-safe mutable access)
    let http_db: server::SharedDatabase = Arc::new(Mutex::new(
        Database::new().expect("Failed to initialize database for HTTP server"),
    ));

    // Start the HTTP server in a background thread
    // This runs independently of the Tauri main thread
    std::thread::spawn(move || {
        // Create a new Tokio runtime for the HTTP server
        let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

        // Run the HTTP server (blocks this thread, which is fine)
        runtime.block_on(async {
            server::start_http_server(http_db).await;
        });
    });

    // Build and run the Tauri application
    tauri::Builder::default()
        // Add application state (database) accessible to all commands
        .manage(AppState { db: Mutex::new(db) })
        // Register all Tauri commands (called from React frontend)
        .invoke_handler(tauri::generate_handler![
            // Notebook commands
            commands::create_notebook,
            commands::get_all_notebooks,
            commands::update_notebook,
            commands::delete_notebook,
            // Note commands
            commands::create_note,
            commands::get_note,
            commands::get_notes_by_notebook,
            commands::update_note,
            commands::delete_note,
            commands::move_note_to_notebook,
            commands::search_notes,
            // PDF commands
            commands::import_pdf,
            commands::get_pdf_data,
            // Web clip commands (also available via HTTP API)
            commands::save_web_clip,
        ])
        // Setup hook runs when the app starts
        .setup(|app| {
            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }

            println!("ExtraBrain started successfully!");
            println!("HTTP API available at http://127.0.0.1:3847");

            Ok(())
        })
        // Run the application
        .run(tauri::generate_context!())
        .expect("Error while running ExtraBrain");
}
