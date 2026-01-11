import { useState, useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";
import {
  Book,
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Upload,
} from "lucide-react";
import { open } from "@tauri-apps/api/dialog";
import { readBinaryFile } from "@tauri-apps/api/fs";

const NOTEBOOK_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export default function Sidebar() {
  const {
    notebooks,
    selectedNotebookId,
    selectNotebook,
    createNotebook,
    updateNotebook,
    deleteNotebook,
    importPdf,
    moveNoteToNotebook,
    loadNotes,
  } = useStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or Escape key
  useEffect(() => {
    if (!menuOpenId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpenId(null);
      }
    };

    // Use setTimeout to avoid closing immediately on the same click that opened it
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpenId]);

  const handleCreateNotebook = async () => {
    if (newNotebookName.trim()) {
      const color = NOTEBOOK_COLORS[notebooks.length % NOTEBOOK_COLORS.length];
      await createNotebook(newNotebookName.trim(), color);
      setNewNotebookName("");
      setIsCreating(false);
    }
  };

  const handleUpdateNotebook = async (id: string) => {
    if (editingName.trim()) {
      await updateNotebook(id, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleDeleteNotebook = async (id: string) => {
    if (notebooks.length > 1) {
      await deleteNotebook(id);
    }
    setMenuOpenId(null);
  };

  const handleImportPdf = async () => {
    if (!selectedNotebookId) return;

    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (selected && typeof selected === "string") {
      const fileData = await readBinaryFile(selected);
      const fileName = selected.split("/").pop() || "document.pdf";
      await importPdf(selectedNotebookId, fileName, Array.from(fileData));
    }
  };

  // Drag and drop handlers for notebooks
  const handleDragOver = (e: React.DragEvent, notebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // Allow dragging to any notebook except the currently selected one
    if (notebookId !== selectedNotebookId) {
      setDragOverId(notebookId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, notebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    // Try both data formats
    const noteId = e.dataTransfer.getData('noteId') || e.dataTransfer.getData('text/plain');

    console.log('Drop event - noteId:', noteId, 'to notebook:', notebookId);
    console.log('Current notebook:', selectedNotebookId);

    if (noteId && notebookId !== selectedNotebookId) {
      console.log('Executing move...');
      try {
        await moveNoteToNotebook(noteId, notebookId);
        console.log('Move completed successfully');
        // Refresh the current notebook's notes
        if (selectedNotebookId) {
          await loadNotes(selectedNotebookId);
        }
      } catch (error) {
        console.error('Move failed:', error);
      }
    } else {
      console.log('Move skipped - noteId:', noteId, 'same notebook:', notebookId === selectedNotebookId);
    }
  };

  return (
    <div className="w-64 h-screen bg-sidebar-bg text-sidebar-text flex flex-col flex-shrink-0">
      {/* Sticky Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-sidebar-bg">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">EB</span>
            </div>
            <span className="font-semibold text-lg">ExtraBrain</span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 space-y-1 border-b border-gray-700/50">
          <button
            onClick={handleImportPdf}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-hover rounded-lg transition-colors"
          >
            <Upload size={16} />
            <span>Import PDF</span>
          </button>
        </div>
      </div>

      {/* Scrollable Notebooks Section */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-muted uppercase tracking-wider"
          >
            <span>Notebooks</span>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {isExpanded && (
            <div className="mt-1 space-y-1">
              {notebooks.map((notebook) => (
                <div
                  key={notebook.id}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all sidebar-item ${
                    selectedNotebookId === notebook.id
                      ? "bg-sidebar-active"
                      : dragOverId === notebook.id
                      ? "bg-brand-500/30 ring-2 ring-brand-500 ring-inset"
                      : "hover:bg-sidebar-hover"
                  }`}
                  onClick={() => selectNotebook(notebook.id)}
                  onDragOver={(e) => handleDragOver(e, notebook.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, notebook.id)}
                >
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: notebook.color || "#22c55e" }}
                  />

                  {editingId === notebook.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleUpdateNotebook(notebook.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateNotebook(notebook.id);
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditingName("");
                        }
                      }}
                      className="flex-1 bg-sidebar-hover text-sidebar-text text-sm px-1 py-0.5 rounded outline-none focus:ring-1 focus:ring-brand-500"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 text-sm truncate">{notebook.name}</span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === notebook.id ? null : notebook.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sidebar-active rounded transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {/* Dropdown Menu */}
                  {menuOpenId === notebook.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-full mt-1 w-40 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-50"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(notebook.id);
                          setEditingName(notebook.name);
                          setMenuOpenId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-hover"
                      >
                        <Edit2 size={14} />
                        Rename
                      </button>
                      {notebooks.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNotebook(notebook.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-sidebar-hover"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Create notebook */}
              {isCreating ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Book size={16} className="text-sidebar-muted flex-shrink-0" />
                  <input
                    type="text"
                    value={newNotebookName}
                    onChange={(e) => setNewNotebookName(e.target.value)}
                    onBlur={() => {
                      if (!newNotebookName.trim()) setIsCreating(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateNotebook();
                      if (e.key === "Escape") {
                        setIsCreating(false);
                        setNewNotebookName("");
                      }
                    }}
                    placeholder="Notebook name"
                    className="flex-1 bg-sidebar-hover text-sidebar-text text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-brand-500"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  <span>New Notebook</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="flex-shrink-0 p-3 border-t border-gray-700 bg-sidebar-bg">
        <div className="text-xs text-sidebar-muted">
          {notebooks.length} notebook{notebooks.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
