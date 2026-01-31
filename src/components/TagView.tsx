import { useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { FileText } from "lucide-react";
import { useStore } from "../stores/useStore";

const TAG_NOTE_LIMIT = 120;

export default function TagView() {
  const { allNotes, loadAllNotes, activeTag, openNoteFromHome, goHome, notebooks } = useStore();

  useEffect(() => {
    loadAllNotes();
  }, [loadAllNotes]);

  const normalizedTag = activeTag?.trim().toLowerCase() ?? "";

  const taggedNotes = useMemo(() => {
    if (!normalizedTag) {
      return [];
    }
    return allNotes
      .filter((note) => (note.tags ?? []).some((tag) => tag.trim().toLowerCase() === normalizedTag))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, TAG_NOTE_LIMIT);
  }, [allNotes, normalizedTag]);

  const totalCount = taggedNotes.length;

  const tagTitle = activeTag?.trim() ?? "Tag";

  return (
    <div className="flex-1 overflow-hidden bg-gray-50">
      <div className="flex h-full flex-col gap-6 p-8">
        <header className="flex items-start justify-between gap-4 flex-shrink-0">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goHome}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm hover:border-brand-200 hover:text-brand-600"
              >
                Back to Home
              </button>
              <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                {tagTitle}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-800">Tagged assets</h1>
            <p className="text-sm text-gray-500">
              {totalCount === 0
                ? "No assets are currently tagged with this label."
                : `Showing ${totalCount} asset${totalCount === 1 ? "" : "s"} tagged with “${tagTitle}”.`}
            </p>
          </div>
        </header>

        <section className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {taggedNotes.length === 0 ? (
            <div className="px-6 py-6 text-sm text-gray-500">
              Add this tag to a note to see it here.
            </div>
          ) : (
            <div className="px-6 py-6 overflow-y-auto h-full">
              <div className="space-y-3">
                {taggedNotes.map((note) => {
                  const notebookName =
                    notebooks.find((notebook) => notebook.id === note.notebook_id)?.name ??
                    "Notebook";
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => openNoteFromHome(note.id, note.notebook_id)}
                      className="w-full rounded-xl border border-gray-100 px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <div className="flex items-center justify-between gap-4">
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
                            {notebookName} • Updated {format(parseISO(note.updated_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {format(parseISO(note.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </button>
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
