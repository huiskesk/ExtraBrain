// ExtraBrain - A modern note-taking app
// Main entry point for the Tauri application

mod commands;
mod db;
mod sanitize;
mod server;
mod server_config;

use db::Database;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::Builder as WindowStateBuilder;

// Application state shared between Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
}

pub fn run() {
    // Initialize the database for Tauri commands
    let db = Database::new().expect("Failed to initialize database");
    println!("Database initialized with tag support.");

    // Build and run the Tauri application
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(WindowStateBuilder::default().build())
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
            commands::get_all_notes,
            commands::update_note,
            commands::delete_note,
            commands::get_deleted_notes,
            commands::restore_note,
            commands::permanently_delete_note,
            commands::move_note_to_notebook,
            commands::search_notes,
            commands::localize_note_images,
            commands::add_tag,
            commands::remove_tag,
            commands::get_all_tags,
            // PDF commands
            commands::import_pdf,
            commands::get_pdf_data,
            commands::export_notes_to_directory,
            commands::import_enex,
            // Web clip commands (also available via HTTP API)
            commands::save_web_clip,
            commands::get_extension_token,
            // Image file handling for drag and drop
            commands::read_image_file,
        ])
        // Setup hook runs when the app starts
        .setup(|app| {
            let export_notes_item =
                MenuItemBuilder::with_id("export_notes", "Export All Notes...").build(app)?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&export_notes_item)
                .build()?;
            let menu = MenuBuilder::new(app).item(&file_menu).build()?;
            app.set_menu(menu)?;

            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // Get the AppHandle for the HTTP server to emit events
            let app_handle = app.handle().clone();

            // Create shared database for HTTP server
            let http_db: server::SharedDatabase = Arc::new(Mutex::new(
                Database::new().expect("Failed to initialize database for HTTP server"),
            ));

            // Start the HTTP server in a background thread
            std::thread::spawn(move || {
                let runtime =
                    tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

                runtime.block_on(async {
                    server::start_http_server(http_db, app_handle).await;
                });
            });

            println!("ExtraBrain started successfully!");
            println!("HTTP API available at http://127.0.0.1:3847");

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "export_notes" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("export-requested", ());
                }
            }
        })
        // Run the application
        .run(tauri::generate_context!())
        .expect("Error while running ExtraBrain");
}
