"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, Plus, X } from "lucide-react";

export interface SearchableOption {
  label: string;
  value: string;
  image?: string | null;
  subtitle?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelectOption?: (option: SearchableOption) => void;
  options: SearchableOption[];
  placeholder?: string;
  allowCustom?: boolean;
  required?: boolean;
  helperText?: string;
}

export function SearchableSelect({
  label,
  value,
  onChange,
  onSelectOption,
  options,
  placeholder = "Select or type...",
  allowCustom = true,
  required = false,
  helperText,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Check if current search query exactly matches an existing option
  const exactMatch = options.some(
    (opt) => opt.label.toLowerCase() === searchQuery.toLowerCase().trim()
  );

  // Selected option details if any
  const selectedOption = options.find(
    (opt) => opt.value.toLowerCase() === value.toLowerCase()
  );

  const handleSelect = (option: SearchableOption) => {
    onChange(option.value);
    onSelectOption?.(option);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleAddCustom = (customText: string) => {
    const clean = customText.trim();
    if (!clean) return;
    const newOpt: SearchableOption = { label: clean, value: clean };
    onChange(clean);
    onSelectOption?.(newOpt);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSearchQuery("");
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs uppercase font-bold text-slate-400">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {value && (
          <span className="text-[11px] text-emerald-400 font-medium">Selected</span>
        )}
      </div>

      {/* Main Trigger Input / Button */}
      <div
        onClick={handleOpen}
        className="w-full bg-slate-950 border border-slate-700 hover:border-slate-500 focus-within:border-red-500 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer transition-all shadow-inner"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectedOption?.image ? (
            <img
              src={selectedOption.image}
              alt=""
              className="w-7 h-7 rounded-full object-cover border border-slate-700 flex-shrink-0"
            />
          ) : value ? (
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {value.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <span
            className={`truncate text-base font-semibold ${
              value ? "text-white" : "text-slate-500"
            }`}
          >
            {value || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear selection"
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              isOpen ? "rotate-180 text-white" : ""
            }`}
          />
        </div>
      </div>

      {helperText && (
        <p className="text-[11px] text-slate-500 mt-1">{helperText}</p>
      )}

      {/* Floating Dropdown Overlay */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-[#181818] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Embedded Search Input */}
          <div className="p-3 border-b border-slate-800 bg-[#212121] flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={`Search or type new ${label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0]);
                  } else if (allowCustom && searchQuery.trim()) {
                    handleAddCustom(searchQuery);
                  }
                } else if (e.key === "Escape") {
                  setIsOpen(false);
                }
              }}
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 p-1">
            {/* If user typed something new and it's not in the list, offer to add it! */}
            {allowCustom && searchQuery.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => handleAddCustom(searchQuery)}
                className="w-full text-left p-3 hover:bg-red-600/20 rounded-xl flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-red-600/20 text-[#ff0000] flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white">
                      Add &ldquo;{searchQuery.trim()}&rdquo;
                    </span>
                    <span className="text-xs text-slate-400 block">
                      Create as new {label.toLowerCase()}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-[#ff0000] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  Press Enter ↵
                </span>
              </button>
            )}

            {filteredOptions.length === 0 && !searchQuery.trim() && (
              <div className="py-6 text-center text-xs text-slate-500">
                No existing {label.toLowerCase()}s found. Type above to add one.
              </div>
            )}

            {filteredOptions.length === 0 && searchQuery.trim() && exactMatch && (
              <div className="py-6 text-center text-xs text-slate-500">
                Already exists.
              </div>
            )}

            {filteredOptions.map((opt) => {
              const isSelected =
                opt.value.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-colors ${
                    isSelected
                      ? "bg-slate-800 text-white font-bold"
                      : "hover:bg-slate-800/60 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {opt.image ? (
                      <img
                        src={opt.image}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border border-slate-700 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                        {opt.label.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="truncate">
                      <span className="text-sm font-medium block truncate">
                        {opt.label}
                      </span>
                      {opt.subtitle && (
                        <span className="text-[11px] text-slate-500 block truncate">
                          {opt.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

