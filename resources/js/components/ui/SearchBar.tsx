import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  /** Dark navy styling for callers whose surrounding page has already moved
      to the dark palette -- mirrors the staff portal's own compact toolbar
      search input (h-11, rounded-xl, small left-aligned icon), the same
      input used on Residents/Households/Inventory/Events/Archive/etc, so
      the two portals' search bars read as one identical control instead of
      two different shapes. Every other caller keeps the original light,
      rounded-full pill look. */
  dark?: boolean;
}

export default function SearchBar({ value, onChange, placeholder, className = "", dark = false }: SearchBarProps) {
  return (
    <div className={`relative w-full ${className}`}>
      <Search className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${dark ? "h-4 w-4 text-white/40" : "h-6 w-6 text-sage-700/80"}`} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border focus:outline-none transition ${
          dark
            ? "h-11 rounded-xl border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            : "h-14 rounded-full border-sage-200 bg-white pl-12 pr-4 text-base shadow-sm focus:ring-1 focus:border-sage-400 focus:ring-sage-700/20"
        }`}
      />
    </div>
  );
}
