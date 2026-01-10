import { useEffect } from "react";
import { useStore } from "./stores/useStore";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import NoteEditor from "./components/NoteEditor";
import SearchBar from "./components/SearchBar";

function App() {
  const { loadNotebooks, selectedNoteId } = useStore();

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Notebooks */}
      <Sidebar />

      {/* Note List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <SearchBar />
        <NoteList />
      </div>

      {/* Note Editor */}
      <div className="flex-1 flex flex-col">
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
