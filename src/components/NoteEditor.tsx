import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Eye,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  Save,
  Check,
  ImageIcon,
} from "lucide-react";
import type { Note } from "../types";
import { sanitizeHtml } from "../utils/sanitizeHtml";

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
  const dragCounter = useRef(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep track of current note id to detect changes
  const currentNoteIdRef = useRef<string | null>(null);
  const hasChangesRef = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const noteIdRef = useRef<string | null>(null);

  // Update refs when state changes
  useEffect(() => {
    hasChangesRef.current = hasChanges;
    titleRef.current = title;
    contentRef.current = content;
    noteIdRef.current = note?.id || null;
  }, [hasChanges, title, content, note?.id]);

  // Determine if this is a web clip (has source_url) - always render as HTML
  const isWebClip = Boolean(note?.source_url);
  const sanitizedContent = useMemo(() => sanitizeHtml(content), [content]);

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
      // Save the previous note before switching
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
    }
  }, [note?.id]);

  // Auto-save when switching from edit to view mode
  const handleToggleMode = useCallback(async () => {
    if (isEditing && hasChanges && note) {
      // Save before switching to view mode
      await saveNote();
    }
    setIsEditing(!isEditing);
  }, [isEditing, hasChanges, note, saveNote]);

  // Manual save handler
  const handleSave = useCallback(async () => {
    await saveNote();
  }, [saveNote]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasChanges(true);
  }, []);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
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
        console.log("Image loaded, inserting into note");

        const useHtmlFormat = isWebClip || note?.content_type === "html";
        let imageMarkup: string;
        if (useHtmlFormat) {
          imageMarkup = `<p><img src="${base64Data}" alt="${file.name}" style="max-width: 100%; height: auto;" /></p>`;
        } else {
          imageMarkup = `\n![${file.name}](${base64Data})\n`;
        }

        setContent((prev) => prev + imageMarkup);
        setHasChanges(true);
      }
    };

    reader.onerror = (error) => {
      console.error("Error reading file:", error);
    };

    reader.readAsDataURL(file);
  }, [isValidImageFile, isWebClip, note?.content_type]);

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

  // Image drag and drop handlers - using counter to handle child element events
  const handleImageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isWebClip) {
      return;
    }

    dragCounter.current++;

    // Check if dragging files (not internal note drag)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingImage(true);
    }
  }, [isWebClip]);

  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isWebClip) {
      return;
    }

    // Check if dragging files (not internal note drag)
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [isWebClip]);

  const handleImageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isWebClip) {
      return;
    }

    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingImage(false);
    }
  }, [isWebClip]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current = 0;
    setIsDraggingImage(false);

    if (isWebClip) {
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const droppedFiles =
      files.length > 0
        ? files
        : Array.from(e.dataTransfer.items || [])
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));

    const imageFiles = droppedFiles.filter((file) => {
      if (!isValidImageFile(file)) {
        return false;
      }
      const maxImageSize = 5 * 1024 * 1024;
      return file.size <= maxImageSize;
    });

    if (imageFiles.length === 0) {
      console.log('No valid image files found in drop');
      return;
    }

    console.log('Processing', imageFiles.length, 'image file(s)');

    // Process each image file
    imageFiles.forEach((file) => {
      insertImageFile(file);
    });
  }, [insertImageFile, isValidImageFile]);

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

  // PDF viewer
  if (note.content_type === "pdf") {
    return <PdfViewer note={note} />;
  }

  return (
    <div
      ref={editorContainerRef}
      className="flex-1 flex flex-col bg-white h-full overflow-hidden relative"
      onDragEnter={handleImageDragEnter}
      onDragOver={handleImageDragOver}
      onDragLeave={handleImageDragLeave}
      onDrop={handleImageDrop}
    >
      {/* Image Drop Zone Overlay */}
      {isDraggingImage && (
        <div className="absolute inset-0 bg-brand-500/20 border-4 border-dashed border-brand-500 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl px-8 py-6 shadow-xl flex items-center gap-3">
            <ImageIcon size={32} className="text-brand-500" />
            <span className="text-lg font-medium text-gray-700">Drop image here</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
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
          {isEditing && (
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

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEditing ? (
          /* Edit Mode */
          <div className="h-full flex flex-col">
            {/* Title Input */}
            <div className="px-8 pt-8 pb-4 border-b border-gray-100">
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

            {/* Content Textarea */}
            <div className="flex-1 min-h-0">
              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder="Start writing..."
                className="w-full h-full p-8 text-gray-800 leading-relaxed resize-none outline-none font-mono text-sm"
              />
            </div>
          </div>
        ) : (
          /* View Mode - Professional Article Rendering */
          <article className="article-view">
            {/* Article Header */}
            <header className="px-8 pt-8 pb-6 border-b border-gray-100">
              <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-3">
                {title}
              </h1>
              {note.source_url && (
                <a
                  href={note.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink size={14} />
                  View original at {new URL(note.source_url).hostname}
                </a>
              )}
            </header>

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
                /* Render Markdown content */
                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(url) =>
                      url.startsWith("data:image/")
                        ? url
                        : defaultUrlTransform(url)
                    }
                  >
                    {content || "*No content*"}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function PdfViewer({ note }: { note: Note }) {
  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="text-red-500" />
          {note.title}
        </h1>
      </div>
      <div className="flex-1 flex items-center justify-center bg-gray-100 overflow-hidden">
        <div className="text-center p-8">
          <FileText size={64} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">PDF Document</p>
          <p className="text-sm text-gray-500">
            PDF viewing will be available in a future update.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            File: {note.pdf_path}
          </p>
        </div>
      </div>
    </div>
  );
}
