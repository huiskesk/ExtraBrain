import { useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "../stores/useStore";

const TRASH_NOTE_LIMIT = 200;

export default function TrashView() {
  const {
    deletedNotes,
    loadDeletedNotes,
    restoreNote,
    permanentlyDeleteNote,
    goHome,
    notebooks,
  } = useStore();

  useEffect(() => {
    loadDeletedNotes();
  }, [loadDeletedNotes]);

  const notesInTrash = useMemo(
    () => [...deletedNotes].slice(0, TRASH_NOTE_LIMIT),
    [deletedNotes]
  );

  return (
    <div className="flex-1 overflow-hidden bg-gray-50">
      <div className="flex h-full flex-col gap-6 p-8">
        <header className="flex items-start justify-between gap-4 flex-shrink-0">
          <div className="space-y-2">
            <button
              type="button"
              onClick={goHome}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm hover:border-brand-200 hover:text-brand-600"
            >
              Back to Home
            </button>
            <h1 className="text-2xl font-semibold text-gray-800">Trash</h1>
            <p className="text-sm text-gray-500">
              {notesInTrash.length === 0
                ? "Trash is empty."
                : `${notesInTrash.length} deleted note${notesInTrash.length === 1 ? "" : "s"} available for restore or permanent deletion.`}
            </p>
          </div>
        </header>

        <section className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {notesInTrash.length === 0 ? (
            <div className="px-6 py-6 text-sm text-gray-500">Deleted notes will appear here.</div>
          ) : (
            <div className="px-6 py-6 overflow-y-auto h-full">
              <div className="space-y-3">
                {notesInTrash.map((note) => {
                  const notebookName =
                    notebooks.find((notebook) => notebook.id === note.notebook_id)?.name ??
                    "Original notebook deleted";
                  return (
                    <div
                      key={note.id}
                      className="w-full rounded-xl border border-gray-100 px-4 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700 truncate">
                              {note.title}
                            </span>
                            {note.content_type === "pdf" && (
                              <span className="inline-flex items-center gap-1 text-xs text-red-500">
                                <FileText size={12} />
                                PDF
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {notebookName} • Deleted{" "}
                            {format(parseISO(note.deleted_at ?? note.updated_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => restoreNote(note.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-200 hover:text-brand-600"
                          >
                            <RotateCcw size={12} />
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => permanentlyDeleteNote(note.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={12} />
                            Permanently delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
