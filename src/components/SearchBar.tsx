import { useState, useEffect, useCallback } from "react";
import { useStore } from "../stores/useStore";
import { Search, X } from "lucide-react";

export default function SearchBar() {
  const { searchQuery, isSearching, searchNotes, clearSearch } = useStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);

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
    <div className="p-3 border-b border-gray-200">
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
          className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 border border-transparent rounded-lg focus:bg-white focus:border-gray-300 focus:outline-none transition-colors"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
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
