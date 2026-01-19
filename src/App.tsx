import { useEffect } from "react";
import { useStore } from "./stores/useStore";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import NoteEditor from "./components/NoteEditor";
import SearchBar from "./components/SearchBar";

function App() {
  const { loadNotebooks, setupEventListeners, selectedNoteId } = useStore();

  useEffect(() => {
    // Load notebooks on startup
    loadNotebooks();

    // Setup Tauri event listeners for real-time updates from Chrome extension
    let cleanup: (() => void) | undefined;

    setupEventListeners().then((unlisten) => {
      cleanup = unlisten;
    });

    // Cleanup listeners on unmount
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [loadNotebooks, setupEventListeners]);

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      const wasDefaultPrevented = event.defaultPrevented;
      event.preventDefault();
      if (!wasDefaultPrevented) {
        event.preventDefault();
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Sidebar - Notebooks - Fixed width, full height, independent scroll */}
      <Sidebar />

      {/* Note List - Fixed width, full height, independent scroll */}
      <div className="w-80 h-screen flex flex-col bg-white border-r border-gray-200 flex-shrink-0">
        {/* Sticky search header */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white">
          <SearchBar />
        </div>
        {/* Scrollable note list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <NoteList />
        </div>
      </div>

      {/* Note Editor - Flexible width, full height, independent scroll */}
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-hidden">
        {selectedNoteId ? (
          <NoteEditor />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const { selectedNotebookId, createNote } = useStore();

  const handleCreateNote = () => {
    if (selectedNotebookId) {
      createNote(selectedNotebookId);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-200 flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          No Note Selected
        </h2>
        <p className="text-gray-500 mb-6">
          Select a note from the list or create a new one
        </p>
        {selectedNotebookId && (
          <button
            onClick={handleCreateNote}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            Create New Note
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
