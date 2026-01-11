import { useStore } from "../stores/useStore";
import { format, parseISO } from "date-fns";
import {
  Plus,
  FileText,
  Globe,
  FileType,
  Pin,
  MoreVertical,
  Trash2,
  FolderInput,
  GripVertical,
  ChevronRight,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Note } from "../types";

export default function NoteList() {
  const {
    notes,
    selectedNotebookId,
    selectedNoteId,
    selectNote,
    createNote,
    deleteNote,
    updateNote,
    moveNoteToNotebook,
    notebooks,
    isLoading,
    isSearching,
  } = useStore();

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [moveMenuNoteId, setMoveMenuNoteId] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);

  // Close menus when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuOpenId || moveMenuNoteId) {
        const target = e.target as HTMLElement;
        if (!target.closest('.note-menu') && !target.closest('.note-menu-trigger')) {
          setMenuOpenId(null);
          setMoveMenuNoteId(null);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (menuOpenId || moveMenuNoteId)) {
        setMenuOpenId(null);
        setMoveMenuNoteId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpenId, moveMenuNoteId]);

  const handleCreateNote = () => {
    if (selectedNotebookId) {
      createNote(selectedNotebookId);
    }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    setMenuOpenId(null);
  };

  const handleTogglePin = async (note: Note) => {
    await updateNote(note.id, { is_pinned: !note.is_pinned });
    setMenuOpenId(null);
  };

  const handleMoveToNotebook = async (noteId: string, notebookId: string) => {
    await moveNoteToNotebook(noteId, notebookId);
    setMoveMenuNoteId(null);
    setMenuOpenId(null);
  };

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('noteId', noteId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedNoteId(noteId);
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
  };

  const getContentTypeIcon = (note: Note) => {
    if (note.content_type === "pdf") {
      return <FileType size={14} className="text-red-500" />;
    }
    if (note.source_url) {
      return <Globe size={14} className="text-blue-500" />;
    }
    return <FileText size={14} className="text-gray-400" />;
  };

  const getPreviewText = (note: Note): string => {
    if (note.content_type === "pdf") {
      return "PDF Document";
    }
    const stripped = note.content
      .replace(/<[^>]*>/g, "")
      .replace(/[#*`_~\[\]]/g, "")
      .trim();
    return stripped.length > 100 ? stripped.substring(0, 100) + "..." : stripped;
  };

  const pinnedNotes = notes.filter((n) => n.is_pinned);
  const unpinnedNotes = notes.filter((n) => !n.is_pinned);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {isSearching ? "Search Results" : `${notes.length} Notes`}
        </span>
        {selectedNotebookId && !isSearching && (
          <button
            onClick={handleCreateNote}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="New Note"
          >
            <Plus size={18} className="text-gray-600" />
          </button>
        )}
      </div>

      {/* Scrollable Note List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <FileText size={40} className="text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              {isSearching ? "No notes found" : "No notes yet"}
            </p>
            {!isSearching && selectedNotebookId && (
              <button
                onClick={handleCreateNote}
                className="mt-3 text-sm text-brand-500 hover:text-brand-600"
              >
                Create your first note
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Pinned Notes */}
            {pinnedNotes.length > 0 && (
              <div className="px-2 py-2">
                <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <Pin size={12} />
                  Pinned
                </div>
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isSelected={selectedNoteId === note.id}
                    isDragging={draggedNoteId === note.id}
                    onClick={() => selectNote(note.id)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    getContentTypeIcon={getContentTypeIcon}
                    getPreviewText={getPreviewText}
                    menuOpenId={menuOpenId}
                    setMenuOpenId={setMenuOpenId}
                    onDelete={handleDeleteNote}
                    onTogglePin={handleTogglePin}
                    moveMenuNoteId={moveMenuNoteId}
                    setMoveMenuNoteId={setMoveMenuNoteId}
                    notebooks={notebooks}
                    onMoveToNotebook={handleMoveToNotebook}
                    currentNotebookId={selectedNotebookId}
                  />
                ))}
              </div>
            )}

            {/* Regular Notes */}
            <div className="px-2 py-2">
              {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
                <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </div>
              )}
              {unpinnedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isSelected={selectedNoteId === note.id}
                  isDragging={draggedNoteId === note.id}
                  onClick={() => selectNote(note.id)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  getContentTypeIcon={getContentTypeIcon}
                  getPreviewText={getPreviewText}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  onDelete={handleDeleteNote}
                  onTogglePin={handleTogglePin}
                  moveMenuNoteId={moveMenuNoteId}
                  setMoveMenuNoteId={setMoveMenuNoteId}
                  notebooks={notebooks}
                  onMoveToNotebook={handleMoveToNotebook}
                  currentNotebookId={selectedNotebookId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, noteId: string) => void;
  onDragEnd: () => void;
  getContentTypeIcon: (note: Note) => React.ReactNode;
  getPreviewText: (note: Note) => string;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onTogglePin: (note: Note) => void;
  moveMenuNoteId: string | null;
  setMoveMenuNoteId: (id: string | null) => void;
  notebooks: Array<{ id: string; name: string; color: string | null }>;
  onMoveToNotebook: (noteId: string, notebookId: string) => void;
  currentNotebookId: string | null;
}

function NoteCard({
  note,
  isSelected,
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
  getContentTypeIcon,
  getPreviewText,
  menuOpenId,
  setMenuOpenId,
  onDelete,
  onTogglePin,
  moveMenuNoteId,
  setMoveMenuNoteId,
  notebooks,
  onMoveToNotebook,
  currentNotebookId,
}: NoteCardProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isMenuOpen = menuOpenId === note.id;
  const isMoveMenuOpen = moveMenuNoteId === note.id;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, note.id)}
      onDragEnd={onDragEnd}
      className={`note-card group relative p-3 mb-1 rounded-lg cursor-pointer transition-all ${
        isDragging ? "opacity-50 scale-95" : ""
      } ${
        isSelected
          ? "bg-brand-50 border border-brand-200"
          : "hover:bg-gray-50 border border-transparent"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <div className="mt-1 opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing">
          <GripVertical size={14} className="text-gray-400" />
        </div>

        <div className="mt-1">{getContentTypeIcon(note)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm text-gray-900 truncate">
              {note.title}
            </h3>
            {note.is_pinned && <Pin size={12} className="text-amber-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {getPreviewText(note)}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span>{format(parseISO(note.updated_at), "MMM d, yyyy")}</span>
            {note.source_url && (
              <span className="truncate max-w-[120px]">
                {new URL(note.source_url).hostname}
              </span>
            )}
          </div>
        </div>

        {/* Menu Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMoveMenuNoteId(null);
            setMenuOpenId(isMenuOpen ? null : note.id);
          }}
          className="note-menu-trigger opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
        >
          <MoreVertical size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="note-menu absolute right-2 top-12 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onTogglePin(note)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Pin size={14} />
            {note.is_pinned ? "Unpin" : "Pin to top"}
          </button>

          {/* Move to submenu trigger */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMoveMenuNoteId(isMoveMenuOpen ? null : note.id);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <span className="flex items-center gap-2">
                <FolderInput size={14} />
                Move to
              </span>
              <ChevronRight size={14} />
            </button>

            {/* Move to submenu */}
            {isMoveMenuOpen && (
              <div
                className="note-menu absolute left-full top-0 ml-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-100">
                  Move to Notebook
                </div>
                {notebooks
                  .filter((nb) => nb.id !== currentNotebookId)
                  .map((nb) => (
                    <button
                      key={nb.id}
                      onClick={() => onMoveToNotebook(note.id, nb.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: nb.color || "#22c55e" }}
                      />
                      <span className="truncate">{nb.name}</span>
                    </button>
                  ))}
                {notebooks.filter((nb) => nb.id !== currentNotebookId).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400 italic">
                    No other notebooks
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => onDelete(note.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
