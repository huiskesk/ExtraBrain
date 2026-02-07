import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { Notebook, Note, ViewMode } from "../types";

// Event payload from backend when a note is created via HTTP API
interface NoteCreatedEvent {
  note: Note;
}

// Drag state for note-to-notebook dragging (bypasses HTML5 dataTransfer issues with Tauri)
interface DragState {
  noteId: string;
  sourceNotebookId: string;
}

interface Store {
  // State
  notebooks: Notebook[];
  notes: Note[];
  allNotes: Note[];
  deletedNotes: Note[];
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  searchQuery: string;
  isSearching: boolean;
  viewMode: ViewMode;
  isLoading: boolean;
  dragState: DragState | null;
  isHomeView: boolean;
  isTagView: boolean;
  isTrashView: boolean;
  activeTag: string | null;

  // Notebook actions
  loadNotebooks: () => Promise<void>;
  createNotebook: (name: string, color?: string) => Promise<Notebook>;
  updateNotebook: (id: string, updates: Partial<Notebook>) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;
  selectNotebook: (id: string | null, options?: { preserveHomeView?: boolean }) => void;

  // Note actions
  loadNotes: (notebookId: string) => Promise<void>;
  loadAllNotes: () => Promise<void>;
  loadDeletedNotes: () => Promise<void>;
  createNote: (
    notebookId: string,
    title?: string,
    content?: string,
    contentType?: string,
    sourceUrl?: string,
    rating?: number,
    tags?: string[]
  ) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  selectNote: (id: string | null) => void;
  openNoteFromHome: (noteId: string, notebookId: string) => Promise<void>;
  moveNoteToNotebook: (noteId: string, notebookId: string) => Promise<void>;

  // Event handler for notes created via Chrome extension
  addNoteFromEvent: (note: Note) => void;

  // Search
  searchNotes: (query: string) => Promise<void>;
  clearSearch: () => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;

  // Home
  goHome: () => void;
  openTagView: (tag: string) => void;
  openTrashView: () => void;

  // PDF
  importPdf: (notebookId: string, fileName: string, data: number[]) => Promise<Note>;

  // Drag state management (for note-to-notebook dragging)
  setDragState: (noteId: string, sourceNotebookId: string) => void;
  clearDragState: () => void;

  // Event listener management
  setupEventListeners: () => Promise<UnlistenFn>;
}

export const useStore = create<Store>((set, get) => ({
  notebooks: [],
  notes: [],
  allNotes: [],
  deletedNotes: [],
  selectedNotebookId: null,
  selectedNoteId: null,
  searchQuery: "",
  isSearching: false,
  viewMode: "edit",
  isLoading: false,
  dragState: null,
  isHomeView: true,
  isTagView: false,
  isTrashView: false,
  activeTag: null,

  // Notebook actions
  loadNotebooks: async () => {
    try {
      const notebooks = await invoke<Notebook[]>("get_all_notebooks");
      const sortedNotebooks = [...notebooks].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      set({ notebooks: sortedNotebooks });

      // Auto-select first notebook if none selected
      if (!get().selectedNotebookId && sortedNotebooks.length > 0) {
        get().selectNotebook(sortedNotebooks[0].id, { preserveHomeView: true });
      }
    } catch (error) {
      console.error("Failed to load notebooks:", error);
    }
  },

  createNotebook: async (name: string, color?: string) => {
    try {
      const notebook = await invoke<Notebook>("create_notebook", { name, color });
      set((state) => ({
        notebooks: [...state.notebooks, notebook].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
      }));
      return notebook;
    } catch (error) {
      console.error("Failed to create notebook:", error);
      throw error;
    }
  },

  updateNotebook: async (id: string, updates: Partial<Notebook>) => {
    try {
      await invoke("update_notebook", { id, ...updates });
      set((state) => ({
        notebooks: state.notebooks
          .map((nb) => (nb.id === id ? { ...nb, ...updates } : nb))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      }));
    } catch (error) {
      console.error("Failed to update notebook:", error);
      throw error;
    }
  },

  deleteNotebook: async (id: string) => {
    try {
      await invoke("delete_notebook", { id });
      const { notebooks, selectedNotebookId } = get();
      const newNotebooks = notebooks.filter((nb) => nb.id !== id);

      set({ notebooks: newNotebooks });

      // If deleted notebook was selected, select first remaining
      if (selectedNotebookId === id && newNotebooks.length > 0) {
        get().selectNotebook(newNotebooks[0].id);
      } else if (newNotebooks.length === 0) {
        set({ selectedNotebookId: null, notes: [], selectedNoteId: null });
      }
    } catch (error) {
      console.error("Failed to delete notebook:", error);
      throw error;
    }
  },

  selectNotebook: (id: string | null, options = {}) => {
    const { preserveHomeView = false } = options;
    set({
      selectedNotebookId: id,
      selectedNoteId: null,
      isSearching: false,
      searchQuery: "",
      isTagView: false,
      isTrashView: false,
      activeTag: null,
      isHomeView: id ? (preserveHomeView ? get().isHomeView : false) : get().isHomeView,
    });
    if (id) {
      get().loadNotes(id);
    }
  },

  // Note actions
  loadNotes: async (notebookId: string) => {
    try {
      set({ isLoading: true });
      const notes = await invoke<Note[]>("get_notes_by_notebook", { notebookId });
      set({ notes, isLoading: false });
      const { isSearching, searchQuery, selectedNoteId } = get();
      if (!isSearching && !searchQuery && !selectedNoteId) {
        set({ selectedNoteId: notes[0]?.id ?? null });
      }
    } catch (error) {
      console.error("Failed to load notes:", error);
      set({ isLoading: false });
    }
  },

  loadAllNotes: async () => {
    try {
      const notes = await invoke<Note[]>("get_all_notes");
      set({ allNotes: notes });
    } catch (error) {
      console.error("Failed to load all notes:", error);
    }
  },

  loadDeletedNotes: async () => {
    try {
      const deletedNotes = await invoke<Note[]>("get_deleted_notes");
      set({ deletedNotes });
    } catch (error) {
      console.error("Failed to load deleted notes:", error);
    }
  },

  createNote: async (
    notebookId: string,
    title = "Untitled Note",
    content = "",
    contentType = "markdown",
    sourceUrl?: string,
    rating = 0,
    tags: string[] = []
  ) => {
    try {
      const note = await invoke<Note>("create_note", {
        notebookId,
        title,
        content,
        contentType,
        sourceUrl,
        rating,
        tags,
      });
      set((state) => ({
        notes: [note, ...state.notes],
        allNotes: [note, ...state.allNotes],
        isHomeView: false,
        isTagView: false,
        isTrashView: false,
        activeTag: null,
      }));
      get().selectNote(note.id);
      return note;
    } catch (error) {
      console.error("Failed to create note:", error);
      throw error;
    }
  },

  updateNote: async (id: string, updates: Partial<Note>) => {
    try {
      await invoke("update_note", { id, ...updates });
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === id ? { ...note, ...updates, updated_at: new Date().toISOString() } : note
        ),
        allNotes: state.allNotes.map((note) =>
          note.id === id ? { ...note, ...updates, updated_at: new Date().toISOString() } : note
        ),
      }));
    } catch (error) {
      console.error("Failed to update note:", error);
      throw error;
    }
  },

  deleteNote: async (id: string) => {
    try {
      await invoke("delete_note", { id });
      const { notes, selectedNoteId } = get();
      const newNotes = notes.filter((note) => note.id !== id);

      set((state) => {
        const deletedNote = state.allNotes.find((note) => note.id === id) ?? null;
        const deletedAt = new Date().toISOString();
        return {
          notes: newNotes,
          allNotes: state.allNotes.filter((note) => note.id !== id),
          deletedNotes: deletedNote
            ? [{ ...deletedNote, deleted_at: deletedAt }, ...state.deletedNotes]
            : state.deletedNotes,
        };
      });

      if (selectedNoteId === id) {
        set({ selectedNoteId: null });
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
      throw error;
    }
  },

  restoreNote: async (id: string) => {
    try {
      await invoke("restore_note", { id });
      set((state) => ({
        deletedNotes: state.deletedNotes.filter((note) => note.id !== id),
      }));
      await get().loadAllNotes();
      const { selectedNotebookId, isTrashView } = get();
      if (selectedNotebookId && !isTrashView) {
        await get().loadNotes(selectedNotebookId);
      }
    } catch (error) {
      console.error("Failed to restore note:", error);
      throw error;
    }
  },

  permanentlyDeleteNote: async (id: string) => {
    try {
      await invoke("permanently_delete_note", { id });
      set((state) => ({
        deletedNotes: state.deletedNotes.filter((note) => note.id !== id),
      }));
    } catch (error) {
      console.error("Failed to permanently delete note:", error);
      throw error;
    }
  },

  selectNote: (id: string | null) => {
    set({ selectedNoteId: id, isHomeView: false, isTagView: false, isTrashView: false, activeTag: null });
  },

  openNoteFromHome: async (noteId: string, notebookId: string) => {
    set({
      selectedNotebookId: notebookId,
      selectedNoteId: null,
      isSearching: false,
      searchQuery: "",
      isHomeView: false,
      isTagView: false,
      isTrashView: false,
      activeTag: null,
    });
    await get().loadNotes(notebookId);
    const noteExists = get().notes.some((note) => note.id === noteId);
    if (noteExists) {
      set({ selectedNoteId: noteId });
    }
  },

  moveNoteToNotebook: async (noteId: string, notebookId: string) => {
    try {
      await invoke("move_note_to_notebook", { noteId, notebookId });

      // Remove note from current list if it was moved to different notebook
      const { selectedNotebookId, notes } = get();
      if (selectedNotebookId !== notebookId) {
        set({
          notes: notes.filter((note) => note.id !== noteId),
          selectedNoteId: null,
        });
      }
      set((state) => ({
        allNotes: state.allNotes.map((note) =>
          note.id === noteId ? { ...note, notebook_id: notebookId } : note
        ),
      }));
    } catch (error) {
      console.error("Failed to move note:", error);
      throw error;
    }
  },

  // Add a note from a Tauri event (triggered by Chrome extension via HTTP API)
  addNoteFromEvent: (note: Note) => {
    const { selectedNotebookId, notes, isSearching, allNotes } = get();

    // Only add to the list if we're viewing the notebook this note belongs to
    // and we're not in search mode
    if (selectedNotebookId === note.notebook_id && !isSearching) {
      // Check if note already exists (avoid duplicates)
      const exists = notes.some((n) => n.id === note.id);
      if (!exists) {
        // Add to the beginning of the list (most recent first)
        set({ notes: [note, ...notes] });
        console.log("Added note from web clipper:", note.title);
      }
    } else {
      console.log("Note received for different notebook:", note.notebook_id);
    }
    if (!allNotes.some((n) => n.id === note.id)) {
      set((state) => ({ allNotes: [note, ...state.allNotes] }));
    }
  },

  // Search
  searchNotes: async (query: string) => {
    if (!query.trim()) {
      get().clearSearch();
      return;
    }

    try {
      set({
        searchQuery: query,
        isSearching: true,
        isLoading: true,
        isHomeView: false,
        isTagView: false,
        isTrashView: false,
        activeTag: null,
      });
      const notes = await invoke<Note[]>("search_notes", { query });
      set({ notes, isLoading: false });
    } catch (error) {
      console.error("Failed to search notes:", error);
      set({ isLoading: false });
    }
  },

  clearSearch: () => {
    const { selectedNotebookId } = get();
    set({ searchQuery: "", isSearching: false });
    if (selectedNotebookId) {
      get().loadNotes(selectedNotebookId);
    }
  },

  // View mode
  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  goHome: () => {
    set({
      isHomeView: true,
      isTagView: false,
      isTrashView: false,
      activeTag: null,
      selectedNoteId: null,
      searchQuery: "",
      isSearching: false,
    });
  },

  openTagView: (tag: string) => {
    set({
      isHomeView: false,
      isTagView: true,
      isTrashView: false,
      activeTag: tag,
      selectedNoteId: null,
      isSearching: false,
      searchQuery: "",
    });
  },

  openTrashView: () => {
    set({
      isHomeView: false,
      isTagView: false,
      isTrashView: true,
      activeTag: null,
      selectedNoteId: null,
      isSearching: false,
      searchQuery: "",
    });
    get().loadDeletedNotes();
  },

  // PDF
  importPdf: async (notebookId: string, fileName: string, data: number[]) => {
    try {
      const note = await invoke<Note>("import_pdf", { notebookId, fileName, data });
      const { selectedNotebookId, isSearching } = get();
      set((state) => ({
        notes:
          selectedNotebookId === notebookId && !isSearching
            ? [note, ...state.notes]
            : state.notes,
        allNotes: [note, ...state.allNotes],
      }));
      return note;
    } catch (error) {
      console.error("Failed to import PDF:", error);
      throw error;
    }
  },

  // Drag state management
  setDragState: (noteId: string, sourceNotebookId: string) => {
    set({ dragState: { noteId, sourceNotebookId } });
  },

  clearDragState: () => {
    set({ dragState: null });
  },

  // Setup event listeners for backend events
  // Call this once when the app starts, returns cleanup function
  setupEventListeners: async () => {
    console.log("Setting up Tauri event listeners...");

    // Listen for notes created via the HTTP API (Chrome extension)
    const unlisten = await listen<NoteCreatedEvent>("note-created", (event) => {
      console.log("Received note-created event:", event.payload);
      get().addNoteFromEvent(event.payload.note);
    });

    console.log("Event listeners ready");

    // Return the cleanup function
    return unlisten;
  },
}));
