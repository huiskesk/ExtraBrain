import { useMemo } from "react";
import { useStore } from "../stores/useStore";
import type { Note } from "../types";

const getPreviewText = (note: Note): string => {
  if (note.content_type === "pdf") {
    return "PDF Document";
  }
  return note.content
    .replace(/<[^>]*>/g, "")
    .replace(/[#*`_~\[\]]/g, "")
    .trim()
    .slice(0, 220);
};

export default function SearchResults() {
  const { notes, searchQuery, isLoading, openNoteFromHome, notebooks } = useStore();
  const notebookNames = useMemo(() => {
    return new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));
  }, [notebooks]);

  return (
    <div className="flex-1 bg-gray-50 overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-semibold text-gray-800">Search Results</h1>
          <p className="text-sm text-gray-500">Results for "{searchQuery}"</p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {isLoading ? (
            <div className="text-sm text-gray-500">Searching...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-gray-500">No results found.</div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openNoteFromHome(note.id, note.notebook_id)}
                  className="w-full text-left rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold text-gray-700 truncate">
                      {note.title}
                    </h2>
                    <span className="text-xs text-gray-400">
                      {notebookNames.get(note.notebook_id) ?? "Notebook"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                    {getPreviewText(note)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
