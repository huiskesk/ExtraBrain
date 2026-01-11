import { useState, useEffect, useCallback, useMemo } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  Save,
  Eye,
  Edit3,
  Columns,
  ExternalLink,
  FileText,
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Quote,
  Link2,
  Image,
  Heading1,
  Heading2,
  BookOpen,
} from "lucide-react";
import type { Note, ViewMode } from "../types";

export default function NoteEditor() {
  const { notes, selectedNoteId, updateNote, viewMode, setViewMode } = useStore();

  const note = useMemo(
    () => notes.find((n) => n.id === selectedNoteId),
    [notes, selectedNoteId]
  );

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Determine if this is a web clip (has source_url)
  const isWebClip = Boolean(note?.source_url);

  // Load note content when selected note changes
  // For web clips, default to preview mode
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setHasChanges(false);

      // Default to preview mode for web clips
      if (note.source_url && viewMode === "edit") {
        setViewMode("preview");
      }
    }
  }, [note?.id]);

  // Auto-save with debounce
  useEffect(() => {
    if (!hasChanges || !note) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateNote(note.id, { title, content });
        setHasChanges(false);
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, content, hasChanges, note, updateNote]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasChanges(true);
  }, []);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setHasChanges(true);
  }, []);

  const insertMarkdown = useCallback((prefix: string, suffix = "") => {
    const textarea = document.querySelector("textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);

    setContent(newText);
    setHasChanges(true);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [content]);

  if (!note) {
    return null;
  }

  // PDF viewer
  if (note.content_type === "pdf") {
    return <PdfViewer note={note} />;
  }

  // HTML content (legacy web clips stored as HTML)
  if (note.content_type === "html") {
    return <HtmlViewer note={note} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      {/* Sticky Toolbar */}
      <div className="flex-shrink-0 sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-1">
          {/* Only show formatting buttons in edit or split mode */}
          {(viewMode === "edit" || viewMode === "split") && (
            <>
              <ToolbarButton icon={Bold} onClick={() => insertMarkdown("**", "**")} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => insertMarkdown("*", "*")} title="Italic" />
              <ToolbarButton icon={Code} onClick={() => insertMarkdown("`", "`")} title="Code" />
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <ToolbarButton icon={Heading1} onClick={() => insertMarkdown("# ")} title="Heading 1" />
              <ToolbarButton icon={Heading2} onClick={() => insertMarkdown("## ")} title="Heading 2" />
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <ToolbarButton icon={List} onClick={() => insertMarkdown("- ")} title="Bullet List" />
              <ToolbarButton icon={ListOrdered} onClick={() => insertMarkdown("1. ")} title="Numbered List" />
              <ToolbarButton icon={Quote} onClick={() => insertMarkdown("> ")} title="Quote" />
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <ToolbarButton icon={Link2} onClick={() => insertMarkdown("[", "](url)")} title="Link" />
              <ToolbarButton icon={Image} onClick={() => insertMarkdown("![alt](", ")")} title="Image" />
            </>
          )}
          {/* Show "Reading" indicator in preview mode */}
          {viewMode === "preview" && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <BookOpen size={16} />
              <span>Reading Mode</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Save indicator */}
          {isSaving && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Save size={12} className="animate-pulse" />
              Saving...
            </span>
          )}
          {hasChanges && !isSaving && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}

          {/* View mode buttons */}
          <div className="flex items-center bg-gray-200 rounded-lg p-0.5">
            <ViewModeButton
              icon={Edit3}
              active={viewMode === "edit"}
              onClick={() => setViewMode("edit")}
              title="Edit"
              label="Edit"
            />
            <ViewModeButton
              icon={Columns}
              active={viewMode === "split"}
              onClick={() => setViewMode("split")}
              title="Split View"
            />
            <ViewModeButton
              icon={Eye}
              active={viewMode === "preview"}
              onClick={() => setViewMode("preview")}
              title="Read"
              label="Read"
            />
          </div>
        </div>
      </div>

      {/* Title - Sticky below toolbar */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 bg-white border-b border-gray-100">
        {viewMode === "preview" ? (
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        ) : (
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Note title"
            className="w-full text-2xl font-bold text-gray-900 border-none outline-none placeholder:text-gray-300"
          />
        )}
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

      {/* Editor / Preview - Scrollable */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {(viewMode === "edit" || viewMode === "split") && (
          <div className={`flex-1 overflow-y-auto ${viewMode === "split" ? "border-r border-gray-200" : ""}`}>
            <textarea
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing..."
              className="w-full h-full min-h-full p-6 text-gray-800 leading-relaxed resize-none outline-none font-mono text-sm"
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <article className="markdown-preview prose prose-sm max-w-none prose-img:rounded-lg prose-img:shadow-md prose-img:my-4 prose-a:text-blue-600 prose-headings:text-gray-900">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    // Custom image component with better styling
                    img: ({ node, ...props }) => (
                      <img
                        {...props}
                        loading="lazy"
                        className="max-w-full h-auto rounded-lg shadow-md my-4"
                        onError={(e) => {
                          // Hide broken images
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ),
                    // Open links in new tab
                    a: ({ node, ...props }) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      />
                    ),
                  }}
                >
                  {content || "*No content*"}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  onClick,
  title,
}: {
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900 transition-colors"
    >
      <Icon size={16} />
    </button>
  );
}

function ViewModeButton({
  icon: Icon,
  active,
  onClick,
  title,
  label,
}: {
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
  title: string;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2 py-1.5 rounded transition-colors ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <Icon size={14} />
      {label && <span className="text-xs font-medium">{label}</span>}
    </button>
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

function HtmlViewer({ note }: { note: Note }) {
  const { updateNote } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);

  const handleSave = async () => {
    await updateNote(note.id, { content });
    setIsEditing(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      {/* Sticky Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{note.title}</h1>
          {note.source_url && (
            <a
              href={note.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 mt-1"
            >
              <ExternalLink size={12} />
              {note.source_url}
            </a>
          )}
        </div>
        <button
          onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {isEditing ? (
            <>
              <Save size={14} />
              Save
            </>
          ) : (
            <>
              <Edit3 size={14} />
              Edit
            </>
          )}
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full min-h-[400px] font-mono text-sm resize-none outline-none border border-gray-200 rounded-lg p-4"
          />
        ) : (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        )}
      </div>
    </div>
  );
}
