import { useState, useEffect, useRef, useCallback } from "react";
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
  Menu,
  FolderDown,
} from "lucide-react";
import { open, message } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import { readBinaryFile } from "@tauri-apps/api/fs";
import { invoke } from "@tauri-apps/api/tauri";

const NOTEBOOK_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#10b981", // emerald
  "#84cc16", // lime
  "#eab308", // yellow
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#a855f7", // violet
  "#0ea5e9", // sky
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
    loadNotebooks,
    dragState,
    clearDragState,
  } = useStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [colorMenuOpenId, setColorMenuOpenId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [extensionToken, setExtensionToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [isImportingEnex, setIsImportingEnex] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const isExporting = useRef(false);
  const lastCreatedColorRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!menuOpenId) {
      setColorMenuOpenId(null);
    }
  }, [menuOpenId]);

  useEffect(() => {
    if (!mainMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (mainMenuRef.current && !mainMenuRef.current.contains(e.target as Node)) {
        setMainMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMainMenuOpen(false);
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mainMenuOpen]);

  useEffect(() => {
    let isMounted = true;

    invoke<string>("get_extension_token")
      .then((token) => {
        if (isMounted) {
          setExtensionToken(token);
        }
      })
      .catch(() => {
        if (isMounted) {
          setExtensionToken(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateNotebook = async () => {
    if (newNotebookName.trim()) {
      const mostRecentColor =
        lastCreatedColorRef.current ??
        [...notebooks]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .find((notebook) => notebook.color)?.color ??
        null;
      const lastColorIndex = mostRecentColor
        ? NOTEBOOK_COLORS.findIndex((color) => color === mostRecentColor)
        : -1;
      const nextColorIndex =
        lastColorIndex >= 0
          ? (lastColorIndex + 1) % NOTEBOOK_COLORS.length
          : 0;
      const color = NOTEBOOK_COLORS[nextColorIndex];
      await createNotebook(newNotebookName.trim(), color);
      lastCreatedColorRef.current = color;
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

  const handleNotebookColorChange = async (id: string, color: string) => {
    await updateNotebook(id, { color });
    setMenuOpenId(null);
    setColorMenuOpenId(null);
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

  const handleImportEnex = async () => {
    if (isImportingEnex) return;

    const selected = await open({
      multiple: false,
      filters: [{ name: "Evernote", extensions: ["enex"] }],
    });

    if (selected && typeof selected === "string") {
      setIsImportingEnex(true);
      try {
        const importedCount = await invoke<number>("import_enex", {
          filePath: selected,
        });
        await loadNotebooks();
        await message(
          `Imported ${importedCount} note${importedCount === 1 ? "" : "s"} successfully.`,
          {
            title: "Evernote Import Complete",
            type: "info",
          }
        );
      } catch (error) {
        console.error("Failed to import ENEX:", error);
        await message(error.toString(), {
          title: "Evernote Import Failed",
          type: "error",
        });
      } finally {
        setIsImportingEnex(false);
      }
    }
  };

  const handleExportNotes = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && typeof selected === "string") {
      try {
        await invoke("export_notes_to_directory", { path: selected });
        await message("Your notes have been successfully exported.", {
          title: "Export Complete",
          type: "info",
        });
      } catch (error) {
        console.error("Failed to export notes:", error);
        await message(error.toString(), {
          title: "Export Failed",
          type: "error",
        });
      }
    }
    setMainMenuOpen(false);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen("export-requested", () => {
      if (isExporting.current) {
        return;
      }
      isExporting.current = true;
      void (async () => {
        try {
          await handleExportNotes();
        } finally {
          isExporting.current = false;
        }
      })();
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch((error) => {
        console.error("Failed to listen for export-requested event:", error);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleExportNotes]);

  const handleCopyToken = async () => {
    if (!extensionToken) return;
    try {
      await navigator.clipboard.writeText(extensionToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy token:", error);
    }
  };

  // Drag and drop handlers for notebooks
  // Uses store-based drag state instead of HTML5 dataTransfer (more reliable with Tauri)
  const handleDragOver = (e: React.DragEvent, notebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const draggedNoteId = e.dataTransfer.getData("text/plain") || dragState?.noteId;
    const sourceNotebookId = dragState?.sourceNotebookId;

    // Use store's drag state or dataTransfer (Tauri intercepts file drops)
    if (draggedNoteId && notebookId !== sourceNotebookId) {
      setDragOverId(notebookId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTarget = e.currentTarget as HTMLElement;
    if (currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, notebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    const droppedNoteId = e.dataTransfer.getData("text/plain") || dragState?.noteId;
    const sourceNotebookId = dragState?.sourceNotebookId;

    if (droppedNoteId && notebookId !== sourceNotebookId) {
      console.log("Executing move...");
      try {
        await moveNoteToNotebook(droppedNoteId, notebookId);
        console.log("Move completed successfully");
        // Refresh the current notebook's notes
        if (selectedNotebookId) {
          await loadNotes(selectedNotebookId);
        }
      } catch (error) {
        console.error("Move failed:", error);
      } finally {
        clearDragState();
      }
    } else if (!droppedNoteId) {
      console.log("Move skipped - no note id available");
    } else {
      console.log("Move skipped - same notebook");
    }
    if (dragState) {
      clearDragState();
    }
  };

  return (
    <div className="w-64 h-screen bg-sidebar-bg text-sidebar-text flex flex-col flex-shrink-0">
      {/* Sticky Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-sidebar-bg">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">EB</span>
              </div>
              <span className="font-semibold text-lg">ExtraBrain</span>
            </div>
            <div className="relative" ref={mainMenuRef}>
              <button
                type="button"
                onClick={() => setMainMenuOpen((prev) => !prev)}
                className="p-2 rounded-lg text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
                aria-label="Open main menu"
              >
                <Menu size={16} />
              </button>
              {mainMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl z-50">
                  <button
                    type="button"
                    onClick={handleExportNotes}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-hover"
                  >
                    <FolderDown size={14} />
                    Export Notes
                  </button>
                </div>
              )}
            </div>
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
          <button
            onClick={handleImportEnex}
            disabled={isImportingEnex}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-hover rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Upload size={16} />
            <span>{isImportingEnex ? "Importing..." : "Import Evernote (.enex)"}</span>
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
                          setColorMenuOpenId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-hover"
                      >
                        <Edit2 size={14} />
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setColorMenuOpenId(
                            colorMenuOpenId === notebook.id ? null : notebook.id
                          );
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-hover"
                      >
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: notebook.color || "#22c55e" }}
                        />
                        Change color
                      </button>
                      {colorMenuOpenId === notebook.id && (
                        <div className="px-3 pb-2">
                          <div className="grid grid-cols-6 gap-2">
                            {NOTEBOOK_COLORS.map((colorOption) => (
                              <button
                                key={colorOption}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotebookColorChange(notebook.id, colorOption);
                                }}
                                className="h-4 w-4 rounded-sm border border-gray-700 hover:scale-110 transition-transform"
                                style={{ backgroundColor: colorOption }}
                                aria-label={`Set notebook color ${colorOption}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
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
        {extensionToken && (
          <div className="mt-3 text-xs text-sidebar-muted">
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wider text-[10px]">
                Extension Token
              </span>
              <button
                type="button"
                onClick={handleCopyToken}
                className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
              >
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-1 rounded bg-gray-900/60 px-2 py-1 font-mono text-[10px] text-gray-200 break-all">
              {extensionToken}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
