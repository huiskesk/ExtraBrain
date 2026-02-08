// ExtraBrain - A modern note-taking app
// Main entry point for the Tauri application

mod commands;
mod db;
mod sanitize;
mod server;
mod server_config;
mod storage_paths;

use db::Database;
#[cfg(desktop)]
use std::sync::Arc;
use std::sync::Mutex;
#[cfg(desktop)]
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
#[cfg(desktop)]
use tauri::Emitter;
use tauri::Manager;

// Application state shared between Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
}

pub fn run() {
    // Build and run the Tauri application
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::init());

    let builder = builder
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
            commands::get_storage_roots,
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
            let storage_paths = storage_paths::resolve_storage_paths(&app.handle())
                .map_err(|e| std::io::Error::other(e))?;

            let db = Database::new(storage_paths.clone())?;
            app.manage(AppState { db: Mutex::new(db) });
            println!("Database initialized with tag support.");

            #[cfg(desktop)]
            {
                let export_notes_item =
                    MenuItemBuilder::with_id("export_notes", "Export All Notes...").build(app)?;
                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&export_notes_item)
                    .build()?;
                let menu = MenuBuilder::new(app).item(&file_menu).build()?;
                app.set_menu(menu)?;
            }

            // Open devtools in debug mode
            #[cfg(all(desktop, debug_assertions))]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            #[cfg(desktop)]
            {
                // Get the AppHandle for the HTTP server to emit events
                let app_handle = app.handle().clone();

                // Create shared database for HTTP server
                let http_db: server::SharedDatabase =
                    Arc::new(Mutex::new(Database::new(storage_paths)?));

                // Start the HTTP server in a background thread
                std::thread::spawn(move || {
                    let runtime =
                        tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

                    runtime.block_on(async {
                        server::start_http_server(http_db, app_handle).await;
                    });
                });

                println!("HTTP API available at http://127.0.0.1:3847");
            }

            println!("ExtraBrain started successfully!");

            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
        if event.id() == "export_notes" {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("export-requested", ());
            }
        }
    });

    // Run the application
    builder
        .run(tauri::generate_context!())
        .expect("Error while running ExtraBrain");
}
