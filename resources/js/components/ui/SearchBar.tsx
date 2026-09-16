import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}

export default function SearchBar({ value, onChange, placeholder, className = "" }: SearchBarProps) {
  return (
    <div className={`relative w-full ${className}`}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-sage-700/80" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-full border border-sage-200 bg-white pl-12 pr-4 text-base shadow-sm focus:border-sage-400 focus:outline-none focus:ring-1 focus:ring-sage-700/20"
      />
    </div>
  );
}
