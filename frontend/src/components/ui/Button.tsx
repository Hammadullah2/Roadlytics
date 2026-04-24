import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
  danger: "btn btn-primary",
};

const dangerStyle = { background: "var(--danger)", color: "white" };

export const Button = ({
  children,
  className = "",
  type = "button",
  variant = "primary",
  style,
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={`${variantClass[variant]} ${className}`}
      style={variant === "danger" ? { ...dangerStyle, ...style } : style}
      {...props}
    >
      {children}
    </button>
  );
};
