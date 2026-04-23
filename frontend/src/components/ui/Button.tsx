/** This component renders a reusable button with dark theme variants. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--accent-green)] text-white hover:bg-[color:var(--accent-green-hover)]",
  secondary:
    "border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] text-[color:var(--text-primary)] hover:bg-[color:var(--border-subtle)]",
  ghost: "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-card-hover)] hover:text-[color:var(--text-primary)]",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

export const Button = ({
  children,
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
