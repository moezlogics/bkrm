"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  searchable?: boolean;
  className?: string;
  id?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  error,
  searchable = false,
  className,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = searchable
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, searchable]);

  return (
    <div className="w-full" ref={ref}>
      {label && (
        <label className="block text-sm font-medium text-content mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            error
              ? "border-danger"
              : open
                ? "border-primary ring-2 ring-primary/30"
                : "border-card-border hover:border-content-tertiary",
            "bg-surface",
            className
          )}
        >
          <span className={cn("flex items-center gap-2", !selected && "text-content-tertiary")}>
            {selected?.icon}
            {selected?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-content-tertiary transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 mt-1.5 w-full rounded-xl border border-card-border bg-surface shadow-lg overflow-hidden"
            >
              {searchable && (
                <div className="p-2 border-b border-card-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-tertiary" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-8 pr-3 py-2 text-sm bg-surface-secondary rounded-lg text-content placeholder:text-content-tertiary focus:outline-none"
                    />
                  </div>
                </div>
              )}
              <ul className="max-h-60 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-content-tertiary text-center">
                    No options found
                  </li>
                ) : (
                  filtered.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange?.(option.value);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left",
                          "hover:bg-surface-secondary transition-colors",
                          option.value === value && "text-primary font-medium bg-primary/5"
                        )}
                      >
                        {option.icon}
                        <span className="flex-1">{option.label}</span>
                        {option.value === value && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
