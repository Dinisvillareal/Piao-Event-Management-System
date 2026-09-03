import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary text shown after the label, e.g. "(12 available)" -- also searchable. */
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  onSelect: (value: string) => void;
  placeholder: string;
  noResultsLabel: string;
  disabled?: boolean;
  className?: string;
}

// A type-to-filter combobox for long option lists (inventory items, etc.)
// where a plain <select> forces the user to scroll through everything.
// Deliberately stateless about "the current value" -- callers that use this
// as an "add one more from a list" picker (the common case here) just want
// onSelect fired and the query cleared afterwards, not a persisted selection
// sitting in the box.
export default function SearchableSelect({
  options,
  onSelect,
  placeholder,
  noResultsLabel,
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.hint ? opt.hint.toLowerCase().includes(q) : false)
    );
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (opt: SearchableSelectOption) => {
    onSelect(opt.value);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlightedIndex];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={isOpen}
          className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-9 py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 focus:border-[#005f63]/40"
        />
        <ChevronDown className={`pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-lg py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-2.5 text-sm text-gray-400 italic">{noResultsLabel}</p>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(opt)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`block w-full text-left px-4 py-2 text-sm truncate ${
                  i === highlightedIndex ? "bg-teal-50 text-[#005f63]" : "text-gray-700"
                }`}
              >
                {opt.label}
                {opt.hint && <span className="ml-1.5 text-xs text-gray-400">{opt.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
