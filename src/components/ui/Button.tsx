"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "whatsapp" | "call" | "chat" | "offer" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md active:scale-[0.98]",
  secondary:
    "bg-secondary text-white hover:bg-secondary-dark shadow-sm hover:shadow-md active:scale-[0.98]",
  whatsapp:
    "btn-whatsapp active:scale-[0.98]",
  call:
    "btn-call active:scale-[0.98]",
  chat:
    "btn-chat-primary active:scale-[0.98]",
  offer:
    "btn-offer active:scale-[0.98]",
  outline:
    "border-2 border-primary/30 text-primary bg-primary/5 hover:bg-primary hover:text-white active:scale-[0.98]",
  ghost:
    "text-content-secondary hover:bg-surface-secondary hover:text-content active:scale-[0.98]",
  danger:
    "bg-danger text-white hover:bg-red-600 shadow-sm hover:shadow-md active:scale-[0.98]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 rounded-md",
  md: "px-4 py-2.5 text-sm gap-2 rounded-md",
  lg: "px-6 py-3 text-base gap-2.5 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      fullWidth = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin-slow" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
