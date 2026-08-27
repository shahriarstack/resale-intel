"use client";

import { Search, X } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  inputRef,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Lets a parent focus the input — e.g. from a keyboard shortcut. */
  inputRef?: React.Ref<HTMLInputElement>;
  /** Small trailing key hint, shown only while the field is empty. */
  hint?: string;
}) {
  return (
    <div className={`search-bar ${className}`}>
      <Search size={16} />
      <input
        ref={inputRef}
        className="field"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} />
        </button>
      ) : hint ? (
        <span className="search-hint kbd">{hint}</span>
      ) : null}
    </div>
  );
}
