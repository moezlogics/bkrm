"use client";

import React from "react";
import { logout } from "@/lib/logout";
import { LogOut, ChevronRight } from "lucide-react";

/** App-style menu row that signs the user out. */
export function LogoutRow() {
  return (
    <button
      onClick={() => logout("/")}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-secondary transition-colors"
    >
      <span className="grid place-items-center h-9 w-9 rounded-full bg-danger/10 text-danger shrink-0">
        <LogOut className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-danger">Log out</span>
      </span>
      <ChevronRight className="h-4 w-4 text-content-tertiary shrink-0" />
    </button>
  );
}
