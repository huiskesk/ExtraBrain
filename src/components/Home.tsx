import { useEffect, useMemo } from "react";
import { useStore } from "../stores/useStore";
import { Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Note } from "../types";

const RECENT_LIMIT = 6;
const TOP_RATED_LIMIT = 8;

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

export default function Home() {
  const { allNotes, loadAllNotes, selectNote } = useStore();

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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-800">Home</h1>
          <p className="text-sm text-gray-500">
            Pick up where you left off with your most recent captures and highest-rated notes.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
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
            <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => selectNote(note.id)}
                  className="group text-left"
                >
                  <div className="text-sm font-semibold text-gray-700 mb-2 truncate">
                    {note.title}
                  </div>
                  <div className="aspect-square rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm transition group-hover:border-brand-200 group-hover:bg-brand-50/40">
                    <div className="text-xs text-gray-600 leading-relaxed h-full overflow-hidden whitespace-pre-line">
                      {getPreviewText(note)}
                    </div>
                  </div>
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

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
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
            <div className="px-6 pb-6">
              <div className="space-y-3">
                {topRatedNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => selectNote(note.id)}
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
                    <div className="flex items-center gap-1 text-amber-500 font-semibold">
                      <Star size={16} className="fill-amber-400 text-amber-400" />
                      <span>{note.rating}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
