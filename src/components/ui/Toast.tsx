"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  const success = useCallback((message: string, duration?: number) => addToast(message, "success", duration), [addToast]);
  const error = useCallback((message: string, duration?: number) => addToast(message, "error", duration), [addToast]);
  const info = useCallback((message: string, duration?: number) => addToast(message, "info", duration), [addToast]);

  const toast = React.useMemo(() => ({
    success,
    error,
    info,
  }), [success, error, info]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, toast }}>
      {children}
      {/* Toast Render Area */}
      {/* Solid, high-contrast cards: readable on any page, whatever the device's
          dark/light setting (the old tinted, see-through ones vanished on white). */}
      <div
        aria-live="polite"
        className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 md:bottom-6 md:right-6 z-[80] flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 p-3.5 pl-4 rounded-xl bg-white text-slate-900 border border-slate-200 border-l-4 shadow-xl ring-1 ring-black/5 pointer-events-auto animate-slide-up transition-all duration-300 ${
              t.type === "success" ? "border-l-emerald-500" : t.type === "error" ? "border-l-rose-500" : "border-l-blue-500"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === "success" && <CheckCircle className="h-5 w-5 text-emerald-500" />}
              {t.type === "error" && <AlertCircle className="h-5 w-5 text-rose-500" />}
              {t.type === "info" && <Info className="h-5 w-5 text-blue-500" />}
            </div>
            <div className="flex-1 text-sm font-semibold leading-snug text-slate-900">{t.message}</div>
            <button
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -m-1 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
