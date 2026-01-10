export interface Notebook {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

export interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  content_type: "markdown" | "html" | "pdf";
  source_url: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  is_archived: boolean;
}

export interface CreateNoteInput {
  notebook_id: string;
  title: string;
  content: string;
  content_type: "markdown" | "html" | "pdf";
  source_url?: string;
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  content?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
}

export interface CreateNotebookInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateNotebookInput {
  id: string;
  name?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
}

export type ViewMode = "edit" | "preview" | "split";

export interface AppState {
  notebooks: Notebook[];
  notes: Note[];
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  searchQuery: string;
  isSearching: boolean;
  viewMode: ViewMode;
}
