#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod db;
mod commands;

use db::Database;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
}

fn main() {
    let db = Database::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(db) })
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
            // Web clip commands
            commands::save_web_clip,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
