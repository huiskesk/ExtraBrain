import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useStore } from "./stores/useStore";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import NoteEditor from "./components/NoteEditor";
import Home from "./components/Home";
import SearchResults from "./components/SearchResults";
import TagView from "./components/TagView";
import TrashView from "./components/TrashView";

function App() {
  const {
    loadNotebooks,
    setupEventListeners,
    selectedNoteId,
    isHomeView,
    notebooks,
    selectedNotebookId,
    isSearching,
    isTagView,
    isTrashView,
  } = useStore();
  const selectedNotebook = notebooks.find((notebook) => notebook.id === selectedNotebookId);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [showSidebarDrawer, setShowSidebarDrawer] = useState(false);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1280;
  const isCompactLayout = isMobile || isTablet;

  useEffect(() => {
    // Load notebooks on startup
    loadNotebooks();

    // Setup Tauri event listeners for real-time updates from Chrome extension
    let cleanup: (() => void) | undefined;

    setupEventListeners().then((unlisten) => {
      cleanup = unlisten;
    });

    // Cleanup listeners on unmount
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [loadNotebooks, setupEventListeners]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isCompactLayout) {
      setShowSidebarDrawer(false);
    }
  }, [isCompactLayout]);

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const content = isTagView ? (
    <TagView />
  ) : isTrashView ? (
    <TrashView />
  ) : isHomeView ? (
    <Home />
  ) : isSearching ? (
    <SearchResults />
  ) : isCompactLayout ? (
    <CompactNotebookLayout
      isMobile={isMobile}
      selectedNotebookName={selectedNotebook?.name ?? "Notes"}
      selectedNoteId={selectedNoteId}
      onOpenSidebar={() => setShowSidebarDrawer(true)}
    />
  ) : (
    <>
      <div className="w-80 h-screen flex flex-col bg-white border-r border-gray-200 flex-shrink-0">
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white">
          <div className="px-4 pt-6 pb-2">
            <h1 className="text-2xl font-semibold text-gray-800 truncate">
              {selectedNotebook?.name ?? "Notes"}
            </h1>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <NoteList />
        </div>
      </div>

      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-hidden">
        {selectedNoteId ? <NoteEditor /> : <EmptyState />}
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {isCompactLayout ? (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
              showSidebarDrawer ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setShowSidebarDrawer(false)}
          />
          <div
            className={`fixed left-0 top-0 z-50 h-screen transition-transform duration-200 ${
              showSidebarDrawer ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar onNavigate={() => setShowSidebarDrawer(false)} compact />
          </div>
          <div className="flex-1 min-w-0">{content}</div>
        </>
      ) : (
        <>
          <Sidebar />
          {content}
        </>
      )}
    </div>
  );
}

function CompactNotebookLayout({
  isMobile,
  selectedNotebookName,
  selectedNoteId,
  onOpenSidebar,
}: {
  isMobile: boolean;
  selectedNotebookName: string;
  selectedNoteId: string | null;
  onOpenSidebar: () => void;
}) {
  const { selectNote } = useStore();

  if (isMobile) {
    if (selectedNoteId) {
      return (
        <NoteEditor
          compact
          onBack={() => selectNote(null)}
          onOpenSidebar={onOpenSidebar}
        />
      );
    }

    return (
      <div className="h-screen bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700"
          >
            <Menu size={18} />
            Notebooks
          </button>
          <h1 className="text-base font-semibold text-gray-800 truncate">{selectedNotebookName}</h1>
          <div className="w-8" />
        </div>
        <NoteList compact onOpenSidebar={onOpenSidebar} />
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0">
      <div className="w-[22rem] border-r border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-800 truncate">{selectedNotebookName}</h1>
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"
          >
            <Menu size={17} />
            Notebooks
          </button>
        </div>
        <NoteList compact onOpenSidebar={onOpenSidebar} />
      </div>
      <div className="flex-1 min-w-0 bg-white">
        {selectedNoteId ? (
          <NoteEditor compact onBack={() => selectNote(null)} onOpenSidebar={onOpenSidebar} />
        ) : (
          <EmptyState compact />
        )}
      </div>
    </div>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  const { selectedNotebookId, createNote } = useStore();

  const handleCreateNote = () => {
    if (selectedNotebookId) {
      createNote(selectedNotebookId);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
      <div className="text-center">
        <div className={`${compact ? "w-20 h-20" : "w-24 h-24"} mx-auto mb-6 rounded-full bg-gray-200 flex items-center justify-center`}>
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h2 className={`${compact ? "text-lg" : "text-xl"} font-semibold text-gray-700 mb-2`}>
          No Note Selected
        </h2>
        <p className="text-gray-500 mb-6">
          Select a note from the list or create a new one
        </p>
        {selectedNotebookId && (
          <button
            onClick={handleCreateNote}
            className="min-h-11 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            Create New Note
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
