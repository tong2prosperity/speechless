import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  const variantClasses = {
    primary:
      "text-white bg-zinc-900 border-zinc-900 hover:bg-zinc-700 hover:border-zinc-700",
    "primary-soft":
      "text-zinc-900 bg-zinc-100 border-zinc-200 hover:bg-zinc-200",
    secondary:
      "text-zinc-700 bg-white border-zinc-300 hover:text-zinc-900 hover:border-zinc-400 hover:bg-zinc-50",
    danger:
      "text-white bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-700 focus-visible:ring-red-600",
    "danger-ghost":
      "text-red-600 border-transparent hover:text-red-700 hover:bg-red-50",
    ghost:
      "text-zinc-700 border-transparent hover:text-zinc-900 hover:bg-zinc-100",
  };

  const sizeClasses = {
    sm: "h-7 px-2.5 text-xs",
    md: "h-8 px-3",
    lg: "h-10 px-4 text-base",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
