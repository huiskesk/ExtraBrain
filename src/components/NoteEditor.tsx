import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useStore } from "../stores/useStore";
import {
  Eye,
  Edit3,
  ExternalLink,
  Globe,
  Save,
  Check,
  ImageIcon,
} from "lucide-react";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import PdfViewer from "./PdfViewer";

// Milkdown imports
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { nord } from "@milkdown/theme-nord";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";

interface MilkdownEditorProps {
  initialContent: string;
  onChange: (content: string) => void;
}

function MilkdownEditorComponent({ initialContent, onChange }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChangeRef.current(markdown);
        });
        // Disable Milkdown's built-in drop handling for files
        // Returning true tells ProseMirror "this event is handled, don't process it"
        // This allows our Tauri file-drop listener to handle image drops exclusively
        ctx.set(editorViewOptionsCtx, {
          handleDrop: (_view, event) => {
            const hasFiles =
              (event.dataTransfer?.files?.length ?? 0) > 0 ||
              Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file");

            if (hasFiles) {
              return true; // Tell editor to ignore file drops
            }
            return false; // Allow other drops (e.g., text) to be handled normally
          },
        });
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(listener as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(commonmark as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(nord as any);
  }, [initialContent]);

  return <Milkdown />;
}

interface ImageData {
  path: string;
  name: string;
  base64: string;
  mime_type: string;
}

export default function NoteEditor() {
  const { notes, selectedNoteId, updateNote } = useStore();

  const note = useMemo(
    () => notes.find((n) => n.id === selectedNoteId),
    [notes, selectedNoteId]
  );

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const dragCounter = useRef(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastDropEventRef = useRef<{ payload: string; timestamp: number } | null>(null);

  // Keep track of current note id to detect changes
  const currentNoteIdRef = useRef<string | null>(null);
  const hasChangesRef = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const noteIdRef = useRef<string | null>(null);
  const isWebClipRef = useRef(false);
  const contentTypeRef = useRef<string | undefined>(undefined);
  // Update refs when state changes
  useEffect(() => {
    hasChangesRef.current = hasChanges;
    titleRef.current = title;
    contentRef.current = content;
    noteIdRef.current = note?.id || null;
    isWebClipRef.current = Boolean(note?.source_url);
    contentTypeRef.current = note?.content_type;
  }, [hasChanges, title, content, note?.id, note?.source_url, note?.content_type]);

  // Determine if this is a web clip (has source_url) - always render as HTML
  const isWebClip = Boolean(note?.source_url);
  const sanitizedContent = useMemo(() => sanitizeHtml(content), [content]);

  // Function to insert image into content
  const insertImageMarkup = useCallback((base64Data: string, fileName: string) => {
    const useHtmlFormat = isWebClipRef.current || contentTypeRef.current === "html";
    let imageMarkup: string;
    if (useHtmlFormat) {
      imageMarkup = `<p><img src="${base64Data}" alt="${fileName}" style="max-width: 100%; height: auto;" /></p>`;
    } else {
      imageMarkup = `\n![${fileName}](${base64Data})\n`;
    }

    setContent((prev) => prev + imageMarkup);
    contentRef.current = contentRef.current + imageMarkup;
    setHasChanges(true);
    // Reinitialize editor with new content
    setEditorKey((prev) => prev + 1);
  }, []);

  // Tauri native file drop handler
  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    let unlistenHover: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;
    let isProcessing = false;

    const setupListener = async () => {
      // Listen for Tauri's native file drop event
      unlistenDrop = await listen<string[]>("tauri://file-drop", async (event) => {
        if (useStore.getState().dragState) {
          return;
        }

        // Prevent duplicate processing
        if (isProcessing) {
          console.log("Already processing, skipping duplicate event");
          return;
        }

        console.log("Tauri file-drop event:", event.payload);

        const filePaths = Array.isArray(event.payload) ? event.payload : [];
        if (filePaths.length === 0) {
          console.log("Skipping file drop - empty payload");
          return;
        }

        const payloadKey = JSON.stringify(event.payload);
        const now = Date.now();
        if (
          lastDropEventRef.current &&
          lastDropEventRef.current.payload === payloadKey &&
          now - lastDropEventRef.current.timestamp < 300
        ) {
          console.log("Duplicate file-drop payload detected, ignoring");
          return;
        }
        lastDropEventRef.current = { payload: payloadKey, timestamp: now };

        // Don't process if we're viewing a web clip or no note is selected
        if (isWebClipRef.current || !noteIdRef.current) {
          console.log("Skipping file drop - web clip or no note selected");
          return;
        }

        isProcessing = true;
        setIsDraggingImage(false);
        dragCounter.current = 0;

        for (const filePath of filePaths) {
          try {
            // Use Tauri command to read the image file
            const imageData = await invoke<ImageData>("read_image_file", { path: filePath });
            console.log("Image read successfully:", imageData.name);
            insertImageMarkup(imageData.base64, imageData.name);
          } catch (error) {
            console.error("Failed to read image file:", error);
          }
        }

        // Reset processing flag after a short delay
        setTimeout(() => {
          isProcessing = false;
        }, 500);
      });

      // Also listen for hover events to show visual feedback
      unlistenHover = await listen("tauri://file-drop-hover", () => {
        if (!isWebClipRef.current && noteIdRef.current) {
          setIsDraggingImage(true);
        }
      });

      unlistenCancelled = await listen("tauri://file-drop-cancelled", () => {
        setIsDraggingImage(false);
        dragCounter.current = 0;
      });
    };

    setupListener();

    return () => {
      // Clean up all listeners
      if (unlistenDrop) unlistenDrop();
      if (unlistenHover) unlistenHover();
      if (unlistenCancelled) unlistenCancelled();
    };
  }, [insertImageMarkup]);

  // Save function
  const saveNote = useCallback(async () => {
    if (!noteIdRef.current || !hasChangesRef.current) return;

    setIsSaving(true);
    try {
      await updateNote(noteIdRef.current, {
        title: titleRef.current,
        content: contentRef.current,
      });
      setHasChanges(false);
      hasChangesRef.current = false;
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  }, [updateNote]);

  // Auto-save when switching to a different note
  useEffect(() => {
    const previousNoteId = currentNoteIdRef.current;

    // If we're switching from one note to another, save the previous one
    if (previousNoteId && previousNoteId !== selectedNoteId && hasChangesRef.current) {
      const savePromise = updateNote(previousNoteId, {
        title: titleRef.current,
        content: contentRef.current,
      });
      savePromise.catch((error) => console.error("Failed to auto-save:", error));
    }

    // Update the current note id
    currentNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId, updateNote]);

  // Load note content when selected note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setHasChanges(false);
      // Web clips default to view mode, regular notes to edit mode
      setIsEditing(!note.source_url);
      // Reset drag state when switching notes
      setIsDraggingImage(false);
      dragCounter.current = 0;
      // Force Milkdown to reinitialize with new content
      setEditorKey((prev) => prev + 1);
    }
  }, [note?.id]);

  // Auto-save when switching from edit to view mode
  const handleToggleMode = useCallback(async () => {
    if (isEditing && hasChanges && note) {
      await saveNote();
    }
    setIsEditing(!isEditing);
  }, [isEditing, hasChanges, note, saveNote]);

  // Manual save handler
  const handleSave = useCallback(async () => {
    await saveNote();
  }, [saveNote]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!note) {
        return;
      }
      const newTitle = e.target.value;
      setTitle(newTitle);
      titleRef.current = newTitle;
      updateNote(note.id, { title: newTitle }).catch((error) => {
        console.error("Failed to update note title:", error);
      });
    },
    [note, updateNote]
  );

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    contentRef.current = newContent;
    setHasChanges(true);
  }, []);

  const isValidImageFile = useCallback((file: File) => {
    const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png"]);
    const allowedExtensions = new Set(["jpg", "jpeg", "png"]);
    const type = file.type.toLowerCase();
    if (type && type.startsWith("image/")) {
      return allowedTypes.has(type);
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    return extension ? allowedExtensions.has(extension) : false;
  }, []);

  // File input handler (for the "Add Image" button)
  const insertImageFile = useCallback((file: File) => {
    const maxImageSize = 5 * 1024 * 1024;
    if (!isValidImageFile(file)) {
      console.log("Only .jpg or .png images are supported.");
      return;
    }

    if (file.size > maxImageSize) {
      console.log("Image exceeds 5MB limit.");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      if (base64Data) {
        console.log("Image loaded via file input, inserting into note");
        insertImageMarkup(base64Data, file.name);
      }
    };

    reader.onerror = (error) => {
      console.error("Error reading file:", error);
    };

    reader.readAsDataURL(file);
  }, [isValidImageFile, insertImageMarkup]);

  const handleImageUploadClick = useCallback(() => {
    if (isWebClip) {
      return;
    }
    fileInputRef.current?.click();
  }, [isWebClip]);

  const handleImageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    insertImageFile(file);
    e.target.value = "";
  }, [insertImageFile]);

  // Keyboard shortcut for save (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges) {
          saveNote();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saveNote]);

  if (!note) {
    return null;
  }

  return (
    <div
      ref={editorContainerRef}
      className="flex-1 flex flex-col bg-white h-full overflow-hidden relative"
    >
      {/* Image Drop Zone Overlay */}
      {isDraggingImage && (
        <div className="absolute inset-0 bg-brand-500/20 border-4 border-dashed border-brand-500 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl px-8 py-6 shadow-xl flex items-center gap-3">
            <ImageIcon size={32} className="text-brand-500" />
            <span className="text-lg font-medium text-gray-700">
              Drop image here
            </span>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4 border-b border-gray-100">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title"
          className="w-full text-2xl font-bold text-gray-900 border-none outline-none placeholder:text-gray-300"
        />
        {note.source_url && (
          <a
            href={note.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 mt-2"
          >
            <ExternalLink size={12} />
            {new URL(note.source_url).hostname}
          </a>
        )}
      </div>

      {note.content_type !== "pdf" && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            {isWebClip && (
              <div className="flex items-center gap-1.5 text-sm text-blue-600">
                <Globe size={16} />
                <span>Web Clip</span>
              </div>
            )}
            {justSaved && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded flex items-center gap-1">
                <Check size={12} />
                Saved
              </span>
            )}
            {hasChanges && !justSaved && (
              <span className="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded">
                Unsaved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing && !isWebClip && (
              <>
                <button
                  onClick={handleImageUploadClick}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  <ImageIcon size={16} />
                  Add Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleImageInputChange}
                  className="hidden"
                />
              </>
            )}

            {/* Save Button */}
            {isEditing && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasChanges
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Save size={14} />
                {isSaving ? "Saving..." : "Save"}
              </button>
            )}

            {/* View/Edit Toggle */}
            <button
              onClick={handleToggleMode}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              {isEditing ? (
                <>
                  <Eye size={16} />
                  View Note
                </>
              ) : (
                <>
                  <Edit3 size={16} />
                  Edit
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {note.content_type === "pdf" ? (
          <div className="h-full">
            <PdfViewer noteId={note.id} />
          </div>
        ) : isEditing ? (
          /* Edit Mode with Milkdown */
          <div className="h-full flex flex-col">
            {/* Milkdown Editor */}
            <div className="flex-1 min-h-0 px-8 py-4 milkdown-editor-container">
              <MilkdownProvider>
                <MilkdownEditorComponent
                  key={editorKey}
                  initialContent={content}
                  onChange={handleContentChange}
                />
              </MilkdownProvider>
            </div>
          </div>
        ) : (
          /* View Mode - Professional Article Rendering */
          <article className="article-view">
            {/* Article Content */}
            <div className="px-8 py-6">
              {isWebClip || note.content_type === "html" ? (
                /* Render HTML content with professional styling */
                <div
                  className="article-content prose prose-lg max-w-none
                    prose-headings:text-gray-900 prose-headings:font-semibold
                    prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4
                    prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                    prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2
                    prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
                    prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-gray-900 prose-strong:font-semibold
                    prose-em:italic
                    prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
                    prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto
                    prose-img:rounded-lg prose-img:shadow-md prose-img:my-6 prose-img:max-w-full prose-img:h-auto
                    prose-figure:my-6
                    prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-gray-500 prose-figcaption:mt-2
                    prose-ul:list-disc prose-ul:pl-6 prose-ul:my-4
                    prose-ol:list-decimal prose-ol:pl-6 prose-ol:my-4
                    prose-li:mb-2
                    prose-hr:border-gray-200 prose-hr:my-8
                    prose-table:border-collapse prose-table:w-full
                    prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2 prose-th:text-left
                    prose-td:border prose-td:border-gray-300 prose-td:px-4 prose-td:py-2"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />
              ) : (
                /* Render Markdown content using Milkdown in read-only style */
                <div className="prose prose-lg max-w-none">
                  <MilkdownProvider>
                    <MilkdownEditorComponent
                      key={`view-${editorKey}`}
                      initialContent={content || "*No content*"}
                      onChange={() => {}}
                    />
                  </MilkdownProvider>
                </div>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
