use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub content_type: String, // "markdown", "html", "pdf"
    pub source_url: Option<String>,
    pub pdf_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub rating: i32,
    pub tags: Vec<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateNotebook {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateNotebook {
    pub id: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateNote {
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub content_type: String,
    pub source_url: Option<String>,
    pub rating: i32,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateImportedNote {
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub content_type: String,
    pub source_url: Option<String>,
    pub rating: i32,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateNote {
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub is_pinned: Option<bool>,
    pub is_archived: Option<bool>,
    pub rating: Option<i32>,
    pub tags: Option<Vec<String>>,
}

pub struct Database {
    conn: Connection,
    data_dir: PathBuf,
}

const ICLOUD_ATTACHMENT_PATH_REWRITE_MARKER: &str = "icloud_attachment_path_rewrite_v1";

impl Database {
    pub fn new() -> Result<Self> {
        let home_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());

        let home_path = PathBuf::from(home_dir);
        let local_path = home_path.join(".extrabrain");

        // Define the Root of iCloud Drive (to check if enabled)
        let icloud_root = home_path
            .join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs");

        // Define our App folder inside iCloud
        let icloud_app_path = icloud_root.join("ExtraBrain");

        let mut data_dir = local_path.clone();
        let mut using_icloud = false;

        // Check if iCloud Drive Root exists (not our folder yet)
        if icloud_root.exists() {
            let icloud_db_path = icloud_app_path.join("extrabrain.db");

            // If the App Folder doesn't exist yet, or DB is missing
            if !icloud_db_path.exists() {
                // 1. Create the App Folder in iCloud
                if let Err(e) = std::fs::create_dir_all(&icloud_app_path) {
                    println!("Failed to create iCloud app folder: {}", e);
                }

                // 2. Migrate DB
                let local_db_path = local_path.join("extrabrain.db");
                if local_db_path.exists() {
                    println!("Migrating database to iCloud...");
                    if let Err(error) = std::fs::copy(&local_db_path, &icloud_db_path) {
                        println!(
                            "Failed to migrate local database to iCloud Drive ({} -> {}): {}",
                            local_db_path.display(),
                            icloud_db_path.display(),
                            error
                        );
                    }
                }

                // 3. Migrate Attachments
                let local_attachments_path = local_path.join("attachments");
                let icloud_attachments_path = icloud_app_path.join("attachments");
                if local_attachments_path.exists() {
                    println!("Migrating attachments to iCloud...");
                    if let Err(error) =
                        copy_dir_all(&local_attachments_path, &icloud_attachments_path)
                    {
                        println!(
                            "Failed to migrate attachments to iCloud Drive ({} -> {}): {}",
                            local_attachments_path.display(),
                            icloud_attachments_path.display(),
                            error
                        );
                    }
                }

                // 4. Backup Old Local Data
                let backup_path = home_path.join(".extrabrain_backup");
                if local_path.exists() {
                    if backup_path.exists() {
                        std::fs::remove_dir_all(&backup_path).ok();
                    }
                    // Using rename is fast/atomic
                    if let Err(error) = std::fs::rename(&local_path, &backup_path) {
                        println!("Failed to rename old local folder to backup: {}", error);
                    } else {
                        println!("Old local data backed up to: {}", backup_path.display());
                    }
                }
            }

            println!(
                "📱 iCloud Drive detected. Using database at: {}",
                icloud_db_path.display()
            );
            data_dir = icloud_app_path;
            using_icloud = true;
        } else {
            println!("💻 iCloud Root not found. Using local database.");
        }

        // Create data directory if it doesn't exist (safety check)
        std::fs::create_dir_all(&data_dir).ok();
        std::fs::create_dir_all(data_dir.join("pdfs")).ok();

        let db_path = data_dir.join("extrabrain.db");

        println!("Database path: {:?}", db_path);

        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.busy_timeout(Duration::from_secs(5))?;

        let db = Database { conn, data_dir };
        db.init_tables()?;
        db.create_default_notebook()?;
        if using_icloud {
            db.rewrite_local_attachment_paths_for_icloud_once(&home_path)?;
        }

        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS notebooks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT,
                icon TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                notebook_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'markdown',
                source_url TEXT,
                pdf_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_pinned INTEGER DEFAULT 0,
                is_archived INTEGER DEFAULT 0,
                rating INTEGER DEFAULT 0,
                deleted_at TEXT,
                FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (note_id, tag_id),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON notes(notebook_id);
            CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
            CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
            CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);

            -- Full-text search
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                title,
                content,
                content='notes',
                content_rowid='rowid'
            );

            -- Triggers to keep FTS in sync
            CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
                INSERT INTO notes_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
            END;
            "
        )?;
        self.ensure_notes_rating_column()?;
        self.ensure_notes_deleted_at_column()?;
        Ok(())
    }

    fn rewrite_local_attachment_paths_for_icloud_once(&self, home_path: &Path) -> Result<()> {
        let already_rewritten: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![ICLOUD_ATTACHMENT_PATH_REWRITE_MARKER],
                |row| row.get(0),
            )
            .optional()?;

        if already_rewritten.is_some() {
            return Ok(());
        }

        let local_prefix = home_path.join(".extrabrain").join("attachments");
        let icloud_prefix = home_path
            .join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs")
            .join("ExtraBrain")
            .join("attachments");

        let local_prefix_str = local_prefix.to_string_lossy();
        let icloud_prefix_str = icloud_prefix.to_string_lossy();

        let local_asset_prefix = format!(
            "asset://localhost/{}",
            local_prefix_str.trim_start_matches('/')
        );
        let icloud_asset_prefix = format!(
            "asset://localhost/{}",
            icloud_prefix_str.trim_start_matches('/')
        );

        let tx = self.conn.unchecked_transaction()?;

        tx.execute(
            "UPDATE notes
             SET content = REPLACE(content, ?1, ?2)
             WHERE content LIKE '%' || ?1 || '%'",
            params![local_asset_prefix, icloud_asset_prefix],
        )?;

        tx.execute(
            "UPDATE notes
             SET content = REPLACE(content, ?1, ?2)
             WHERE content LIKE '%' || ?1 || '%'",
            params![local_prefix_str.as_ref(), icloud_prefix_str.as_ref()],
        )?;

        tx.execute(
            "INSERT INTO app_metadata (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![
                ICLOUD_ATTACHMENT_PATH_REWRITE_MARKER,
                "done",
                Utc::now().to_rfc3339()
            ],
        )?;

        tx.commit()?;
        println!("Completed one-time iCloud attachment path rewrite in notes.content");
        Ok(())
    }

    fn ensure_notes_rating_column(&self) -> Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(notes)")?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<String>>>()?;
        if !columns.iter().any(|name| name == "rating") {
            self.conn
                .execute("ALTER TABLE notes ADD COLUMN rating INTEGER DEFAULT 0", [])?;
            self.conn
                .execute("UPDATE notes SET rating = 0 WHERE rating IS NULL", [])?;
        }
        Ok(())
    }

    fn ensure_notes_deleted_at_column(&self) -> Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(notes)")?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<String>>>()?;
        if !columns.iter().any(|name| name == "deleted_at") {
            self.conn
                .execute("ALTER TABLE notes ADD COLUMN deleted_at TEXT", [])?;
        }
        Ok(())
    }

    fn create_default_notebook(&self) -> Result<()> {
        let count: i32 = self
            .conn
            .query_row("SELECT COUNT(*) FROM notebooks", [], |row| row.get(0))?;

        if count == 0 {
            let now = Utc::now().to_rfc3339();
            self.conn.execute(
                "INSERT INTO notebooks (id, name, color, created_at, updated_at, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    Uuid::new_v4().to_string(),
                    "Main Notebook",
                    "#22c55e",
                    now,
                    now,
                    0
                ],
            )?;
            println!("Created default 'Main Notebook'");
        }
        Ok(())
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    // Notebook operations
    pub fn create_notebook(&self, input: CreateNotebook) -> Result<Notebook> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let max_order: i32 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) FROM notebooks",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        self.conn.execute(
            "INSERT INTO notebooks (id, name, color, icon, created_at, updated_at, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.name,
                input.color,
                input.icon,
                now,
                now,
                max_order + 1
            ],
        )?;

        println!("Created notebook: {} (id: {})", input.name, id);

        Ok(Notebook {
            id,
            name: input.name,
            color: input.color,
            icon: input.icon,
            created_at: now.clone(),
            updated_at: now,
            sort_order: max_order + 1,
        })
    }

    pub fn get_all_notebooks(&self) -> Result<Vec<Notebook>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, color, icon, created_at, updated_at, sort_order
             FROM notebooks ORDER BY sort_order ASC",
        )?;

        let notebooks = stmt.query_map([], |row| {
            Ok(Notebook {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })?;

        let result: Vec<Notebook> = notebooks.collect::<Result<Vec<_>>>()?;
        println!("Loaded {} notebooks from database", result.len());
        Ok(result)
    }

    pub fn update_notebook(&self, input: UpdateNotebook) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        if let Some(name) = input.name {
            self.conn.execute(
                "UPDATE notebooks SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, now, input.id],
            )?;
        }
        if let Some(color) = input.color {
            self.conn.execute(
                "UPDATE notebooks SET color = ?1, updated_at = ?2 WHERE id = ?3",
                params![color, now, input.id],
            )?;
        }
        if let Some(icon) = input.icon {
            self.conn.execute(
                "UPDATE notebooks SET icon = ?1, updated_at = ?2 WHERE id = ?3",
                params![icon, now, input.id],
            )?;
        }
        if let Some(sort_order) = input.sort_order {
            self.conn.execute(
                "UPDATE notebooks SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![sort_order, now, input.id],
            )?;
        }
        Ok(())
    }

    pub fn delete_notebook(&self, id: &str) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM notes WHERE notebook_id = ?1", params![id])?;
        tx.execute("DELETE FROM notebooks WHERE id = ?1", params![id])?;
        tx.execute(
            "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)",
            [],
        )?;
        tx.commit()?;
        println!("Deleted notebook: {}", id);
        Ok(())
    }

    // Note operations
    pub fn create_note(&self, input: CreateNote) -> Result<Note> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO notes (id, notebook_id, title, content, content_type, source_url, rating, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                input.notebook_id,
                input.title,
                input.content,
                input.content_type,
                input.source_url,
                input.rating,
                now,
                now
            ],
        )?;

        println!(
            "Created note: {} in notebook {}",
            input.title, input.notebook_id
        );

        self.set_note_tags(&id, &input.tags)?;

        Ok(Note {
            id,
            notebook_id: input.notebook_id,
            title: input.title,
            content: input.content,
            content_type: input.content_type,
            source_url: input.source_url,
            pdf_path: None,
            created_at: now.clone(),
            updated_at: now,
            is_pinned: false,
            is_archived: false,
            rating: input.rating,
            tags: input.tags,
            deleted_at: None,
        })
    }

    pub fn create_imported_note(&self, input: CreateImportedNote) -> Result<()> {
        let id = Uuid::new_v4().to_string();

        self.conn.execute(
            "INSERT INTO notes (id, notebook_id, title, content, content_type, source_url, rating, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                input.notebook_id,
                input.title,
                input.content,
                input.content_type,
                input.source_url,
                input.rating,
                input.created_at,
                input.updated_at
            ],
        )?;

        self.set_note_tags(&id, &input.tags)?;

        Ok(())
    }

    pub fn get_note(&self, id: &str) -> Result<Note> {
        let mut note = self.conn.query_row(
            "SELECT id, notebook_id, title, content, content_type, source_url, pdf_path,
                    created_at, updated_at, is_pinned, is_archived, rating, deleted_at
             FROM notes WHERE id = ?1",
            params![id],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    notebook_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    content_type: row.get(4)?,
                    source_url: row.get(5)?,
                    pdf_path: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    is_pinned: row.get(9)?,
                    is_archived: row.get(10)?,
                    rating: row.get(11)?,
                    tags: Vec::new(),
                    deleted_at: row.get(12)?,
                })
            },
        )?;

        note.tags = self.fetch_tags_for_note(id)?;
        Ok(note)
    }

    pub fn get_notes_by_notebook(&self, notebook_id: &str) -> Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, notebook_id, title, content, content_type, source_url, pdf_path,
                    created_at, updated_at, is_pinned, is_archived, rating, deleted_at
             FROM notes
             WHERE notebook_id = ?1 AND is_archived = 0 AND deleted_at IS NULL
             ORDER BY is_pinned DESC, rating DESC, updated_at DESC",
        )?;

        let notes = stmt.query_map(params![notebook_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                source_url: row.get(5)?,
                pdf_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                is_pinned: row.get(9)?,
                is_archived: row.get(10)?,
                rating: row.get(11)?,
                tags: Vec::new(),
                deleted_at: row.get(12)?,
            })
        })?;

        let mut notes: Vec<Note> = notes.collect::<Result<Vec<_>>>()?;
        for note in &mut notes {
            note.tags = self.fetch_tags_for_note(&note.id)?;
        }

        Ok(notes)
    }

    pub fn get_all_notes(&self) -> Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, notebook_id, title, content, content_type, source_url, pdf_path,
                    created_at, updated_at, is_pinned, is_archived, rating, deleted_at
             FROM notes
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC",
        )?;

        let notes = stmt.query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                source_url: row.get(5)?,
                pdf_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                is_pinned: row.get(9)?,
                is_archived: row.get(10)?,
                rating: row.get(11)?,
                tags: Vec::new(),
                deleted_at: row.get(12)?,
            })
        })?;

        let mut notes: Vec<Note> = notes.collect::<Result<Vec<_>>>()?;
        for note in &mut notes {
            note.tags = self.fetch_tags_for_note(&note.id)?;
        }

        Ok(notes)
    }

    pub fn update_note(&self, input: UpdateNote) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        if let Some(title) = &input.title {
            self.conn.execute(
                "UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, input.id],
            )?;
        }
        if let Some(content) = &input.content {
            self.conn.execute(
                "UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
                params![content, now, input.id],
            )?;
        }
        if let Some(is_pinned) = input.is_pinned {
            self.conn.execute(
                "UPDATE notes SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3",
                params![is_pinned, now, input.id],
            )?;
        }
        if let Some(is_archived) = input.is_archived {
            self.conn.execute(
                "UPDATE notes SET is_archived = ?1, updated_at = ?2 WHERE id = ?3",
                params![is_archived, now, input.id],
            )?;
        }
        if let Some(rating) = input.rating {
            self.conn.execute(
                "UPDATE notes SET rating = ?1, updated_at = ?2 WHERE id = ?3",
                params![rating, now, input.id],
            )?;
        }
        if let Some(tags) = input.tags {
            self.set_note_tags(&input.id, &tags)?;
        }

        println!("Updated note: {}", input.id);
        Ok(())
    }

    pub fn delete_note(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE notes SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![now, now, id],
        )?;
        println!("Soft deleted note: {}", id);
        Ok(())
    }

    pub fn get_deleted_notes(&self) -> Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, notebook_id, title, content, content_type, source_url, pdf_path,
                    created_at, updated_at, is_pinned, is_archived, rating, deleted_at
             FROM notes
             WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC",
        )?;

        let notes = stmt.query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                source_url: row.get(5)?,
                pdf_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                is_pinned: row.get(9)?,
                is_archived: row.get(10)?,
                rating: row.get(11)?,
                tags: Vec::new(),
                deleted_at: row.get(12)?,
            })
        })?;

        let mut notes: Vec<Note> = notes.collect::<Result<Vec<_>>>()?;
        for note in &mut notes {
            note.tags = self.fetch_tags_for_note(&note.id)?;
        }

        Ok(notes)
    }

    pub fn restore_note(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        println!("Restored note: {}", id);
        Ok(())
    }

    pub fn permanently_delete_note(&self, id: &str) -> Result<()> {
        if let Ok(note) = self.get_note(id) {
            if let Some(pdf_path) = note.pdf_path {
                std::fs::remove_file(pdf_path).ok();
            }
        }
        self.conn
            .execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        println!("Permanently deleted note: {}", id);
        Ok(())
    }

    pub fn move_note_to_notebook(&self, note_id: &str, notebook_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let rows_affected = self.conn.execute(
            "UPDATE notes SET notebook_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![notebook_id, now, note_id],
        )?;
        println!(
            "Moved note {} to notebook {} (rows affected: {})",
            note_id, notebook_id, rows_affected
        );
        Ok(())
    }

    pub fn search_notes(&self, query: &str) -> Result<Vec<Note>> {
        let search_query = format!("{}*", query);
        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.notebook_id, n.title, n.content, n.content_type, n.source_url,
                    n.pdf_path, n.created_at, n.updated_at, n.is_pinned, n.is_archived, n.rating, n.deleted_at
             FROM notes n
             JOIN notes_fts fts ON n.rowid = fts.rowid
             WHERE notes_fts MATCH ?1 AND n.is_archived = 0 AND n.deleted_at IS NULL
             ORDER BY rank",
        )?;

        let notes = stmt.query_map(params![search_query], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                source_url: row.get(5)?,
                pdf_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                is_pinned: row.get(9)?,
                is_archived: row.get(10)?,
                rating: row.get(11)?,
                tags: Vec::new(),
                deleted_at: row.get(12)?,
            })
        })?;

        let mut notes: Vec<Note> = notes.collect::<Result<Vec<_>>>()?;
        for note in &mut notes {
            note.tags = self.fetch_tags_for_note(&note.id)?;
        }

        Ok(notes)
    }

    // PDF operations
    pub fn import_pdf(&self, notebook_id: &str, file_name: &str, data: &[u8]) -> Result<Note> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Save PDF to disk
        let pdf_dir = self.data_dir.join("pdfs");
        let pdf_path = pdf_dir.join(format!("{}_{}", id, file_name));
        std::fs::write(&pdf_path, data)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let pdf_path_str = pdf_path.to_string_lossy().to_string();

        self.conn.execute(
            "INSERT INTO notes (id, notebook_id, title, content, content_type, pdf_path, rating, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                notebook_id,
                file_name,
                format!("PDF Document: {}", file_name),
                "pdf",
                pdf_path_str,
                0,
                now,
                now
            ],
        )?;

        Ok(Note {
            id,
            notebook_id: notebook_id.to_string(),
            title: file_name.to_string(),
            content: format!("PDF Document: {}", file_name),
            content_type: "pdf".to_string(),
            source_url: None,
            pdf_path: Some(pdf_path_str),
            created_at: now.clone(),
            updated_at: now,
            is_pinned: false,
            is_archived: false,
            rating: 0,
            tags: Vec::new(),
            deleted_at: None,
        })
    }

    pub fn get_pdf_data(&self, note_id: &str) -> Result<Vec<u8>> {
        let note = self.get_note(note_id)?;
        if let Some(pdf_path) = note.pdf_path {
            std::fs::read(&pdf_path)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
        } else {
            Err(rusqlite::Error::QueryReturnedNoRows)
        }
    }

    fn fetch_tags_for_note(&self, note_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.name
             FROM tags t
             JOIN note_tags nt ON nt.tag_id = t.id
             WHERE nt.note_id = ?1
             ORDER BY t.name ASC",
        )?;

        let tags = stmt
            .query_map(params![note_id], |row| row.get(0))?
            .collect::<Result<Vec<String>>>()?;

        Ok(tags)
    }

    fn set_note_tags(&self, note_id: &str, tags: &[String]) -> Result<()> {
        self.conn
            .execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])?;

        for tag_name in tags {
            let tag_id = self.get_or_create_tag_id(tag_name)?;
            self.conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note_id, tag_id],
            )?;
        }

        Ok(())
    }

    fn get_or_create_tag_id(&self, tag_name: &str) -> Result<String> {
        if let Ok(id) = self.conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |row| row.get(0),
        ) {
            return Ok(id);
        }

        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO tags (id, name) VALUES (?1, ?2)",
            params![id, tag_name],
        )?;

        Ok(id)
    }

    pub fn add_tag_to_note(&self, note_id: &str, tag_name: &str) -> Result<Vec<String>> {
        let trimmed = tag_name.trim();
        if trimmed.is_empty() {
            return self.fetch_tags_for_note(note_id);
        }
        let tag_id = self.get_or_create_tag_id(trimmed)?;
        self.conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, tag_id],
        )?;
        self.fetch_tags_for_note(note_id)
    }

    pub fn remove_tag_from_note(&self, note_id: &str, tag_name: &str) -> Result<Vec<String>> {
        let tag_id: Option<String> = self
            .conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag_name],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(tag_id) = tag_id {
            self.conn.execute(
                "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
                params![note_id, tag_id],
            )?;
        }
        self.fetch_tags_for_note(note_id)
    }

    pub fn get_all_tags(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT name FROM tags ORDER BY name ASC")?;
        let tags = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>>>()?;
        Ok(tags)
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let destination = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &destination)?;
        } else {
            std::fs::copy(entry.path(), destination)?;
        }
    }
    Ok(())
}
