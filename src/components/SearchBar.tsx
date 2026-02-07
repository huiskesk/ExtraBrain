import { useState, useEffect, useCallback } from "react";
import { useStore } from "../stores/useStore";
import { Search, X } from "lucide-react";

export default function SearchBar() {
  const { searchQuery, isSearching, searchNotes, clearSearch } = useStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery.trim()) {
        searchNotes(localQuery);
      } else if (isSearching) {
        clearSearch();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localQuery, searchNotes, clearSearch, isSearching]);

  const handleClear = useCallback(() => {
    setLocalQuery("");
    clearSearch();
  }, [clearSearch]);

  return (
    <div className="p-3 border-b border-gray-700/50">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search notes..."
          className="w-full min-h-11 pl-9 pr-10 py-2 text-sm bg-gray-800 text-sidebar-text placeholder:text-gray-400 border border-gray-700 rounded-lg focus:bg-gray-900 focus:border-brand-400 focus:outline-none transition-colors"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-8 min-w-8 p-1 text-gray-400 hover:text-gray-200 rounded"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {isSearching && (
        <div className="mt-2 text-xs text-gray-500">
          Searching for "{searchQuery}"
        </div>
      )}
    </div>
  );
}
