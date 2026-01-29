// ExtraBrain - A modern note-taking app
// Main entry point for the Tauri application

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod db;
mod sanitize;
mod server;
mod server_config;

use db::Database;
use std::sync::{Arc, Mutex};
use tauri::{CustomMenuItem, Manager, Menu, MenuEntry, Submenu};
use tauri_plugin_window_state::Builder as WindowStateBuilder;

// Application state shared between Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
}

fn main() {
    // Initialize the database for Tauri commands
    let db = Database::new().expect("Failed to initialize database");
    println!("Database initialized with tag support.");
    let export_notes_item = CustomMenuItem::new("export_notes", "Export All Notes...");
    let mut menu = Menu::os_default("ExtraBrain");
    let mut file_menu_found = false;

    for entry in menu.items.iter_mut() {
        if let MenuEntry::Submenu(submenu) = entry {
            if submenu.title == "File" {
                submenu.inner = submenu.inner.clone().add_item(export_notes_item.clone());
                file_menu_found = true;
                break;
            }
        }
    }

    if !file_menu_found {
        menu = menu.add_submenu(Submenu::new(
            "File",
            Menu::new().add_item(export_notes_item),
        ));
    }

    // Build and run the Tauri application
    tauri::Builder::default()
        .menu(menu)
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
            commands::update_note,
            commands::delete_note,
            commands::move_note_to_notebook,
            commands::search_notes,
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
            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }

            // Get the AppHandle for the HTTP server to emit events
            let app_handle = app.handle();

            // Create shared database for HTTP server
            let http_db: server::SharedDatabase = Arc::new(Mutex::new(
                Database::new().expect("Failed to initialize database for HTTP server"),
            ));

            // Start the HTTP server in a background thread
            // We start it here in setup() so we have access to AppHandle
            std::thread::spawn(move || {
                // Create a new Tokio runtime for the HTTP server
                let runtime = tokio::runtime::Runtime::new()
                    .expect("Failed to create Tokio runtime");

                // Run the HTTP server (blocks this thread, which is fine)
                runtime.block_on(async {
                    server::start_http_server(http_db, app_handle).await;
                });
            });

            println!("ExtraBrain started successfully!");
            println!("HTTP API available at http://127.0.0.1:3847");

            Ok(())
        })
        .on_menu_event(|event| {
            if event.menu_item_id() == "export_notes" {
                if let Some(window) = event.window().app_handle().get_window("main") {
                    let _ = window.emit("export-requested", ());
                }
            }
        })
        // Run the application
        .run(tauri::generate_context!())
        .expect("Error while running ExtraBrain");
}
