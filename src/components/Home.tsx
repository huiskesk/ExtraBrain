import { useEffect, useMemo } from "react";
import { useStore } from "../stores/useStore";
import { FileText, Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Note } from "../types";
import { getNoteCoverImage } from "../utils/notePreview";

const RECENT_LIMIT = 6;
const TOP_RATED_LIMIT = 30;

const PREVIEW_CHARACTER_LIMIT = 140;

const getPreviewText = (note: Note): string => {
  return note.content
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, " ")
    .replace(/[`*_>#~!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_CHARACTER_LIMIT);
};

export default function Home() {
  const { allNotes, loadAllNotes, openNoteFromHome } = useStore();

  useEffect(() => {
    loadAllNotes();
  }, [loadAllNotes]);

  const recentNotes = useMemo(() => {
    return [...allNotes]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, RECENT_LIMIT);
  }, [allNotes]);

  const topRatedNotes = useMemo(() => {
    return [...allNotes]
      .filter((note) => note.rating > 0)
      .sort((a, b) => {
        if (b.rating !== a.rating) {
          return b.rating - a.rating;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })
      .slice(0, TOP_RATED_LIMIT);
  }, [allNotes]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    allNotes.forEach((note) => {
      (note.tags ?? []).forEach((tag) => {
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    });
  }, [allNotes]);

  return (
    <div className="flex-1 overflow-hidden bg-gray-50">
      <div className="flex h-full flex-col gap-6 p-8">
        <header className="space-y-3 flex-shrink-0">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-800">Home</h1>
            <p className="text-sm text-gray-500">
              Pick up where you left off with your most recent captures and highest-rated notes.
            </p>
          </div>
        </header>

        <section className="flex-shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-6 pt-6 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Recent additions</h2>
              <p className="text-sm text-gray-500">Your latest captures across notebooks.</p>
            </div>
          </div>
          {recentNotes.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-gray-500">
              No recent notes yet. Capture a new idea to see it here.
            </div>
          ) : (
            <div className="flex gap-4 px-6 pb-6 overflow-x-auto">
              {recentNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openNoteFromHome(note.id, note.notebook_id)}
                  className="group text-left flex-shrink-0 w-52"
                >
                  <div className="text-sm font-semibold text-gray-700 mb-2 truncate">
                    {note.title}
                  </div>
                  {(() => {
                    const coverImage = getNoteCoverImage(note);
                    const previewText = getPreviewText(note);
                    return (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm transition group-hover:border-brand-200 group-hover:bg-brand-50/40 h-64 flex flex-col">
                        <div className="text-xs text-gray-600 leading-relaxed flex-1 overflow-hidden">
                          {previewText}
                        </div>
                        {coverImage ? (
                          <div className="mt-4 h-32 w-full flex items-center justify-center">
                            <img
                              src={coverImage}
                              alt={note.title}
                              className="h-32 w-full object-contain"
                            />
                          </div>
                        ) : note.content_type === "pdf" ? (
                          <div className="mt-4 h-32 w-full flex items-center justify-center rounded-lg bg-red-50 text-red-500">
                            <FileText size={36} />
                          </div>
                        ) : (
                          <div className="mt-4 h-32 w-full" />
                        )}
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <span>{format(parseISO(note.created_at), "MMM d, yyyy")}</span>
                    {note.rating > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {note.rating}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex-1 min-h-0">
          <div className="flex h-full gap-6">
            <div className="flex flex-1 min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between px-6 pt-6 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Highest ranked</h2>
                  <p className="text-sm text-gray-500">
                    Notes your ranking system keeps at the top.
                  </p>
                </div>
              </div>
              {topRatedNotes.length === 0 ? (
                <div className="px-6 pb-6 text-sm text-gray-500">
                  Rate a note to spotlight it here.
                </div>
              ) : (
                <div className="px-6 pb-6 overflow-y-auto min-h-0">
                  <div className="space-y-3">
                    {topRatedNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => openNoteFromHome(note.id, note.notebook_id)}
                        className="w-full flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-700 truncate">
                            {note.title}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Updated {format(parseISO(note.updated_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 text-amber-500 font-semibold text-xs">
                          <Star size={14} className="fill-amber-400 text-amber-400" />
                          <span>{note.rating}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-1 min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between px-6 pt-6 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Top tags</h2>
                  <p className="text-sm text-gray-500">Most-used tags across your notes.</p>
                </div>
              </div>
              {topTags.length === 0 ? (
                <div className="px-6 pb-6 text-sm text-gray-500">
                  Add tags to notes to build this list.
                </div>
              ) : (
                <div className="px-6 pb-6 overflow-y-auto min-h-0">
                  <div className="flex flex-wrap gap-2">
                    {topTags.map(([tag, count]) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                      >
                        <span>{tag}</span>
                        <span className="text-[10px] text-gray-400">({count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
