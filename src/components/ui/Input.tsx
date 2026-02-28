import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input: React.FC<InputProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "w-full rounded-md border border-zinc-300 bg-white text-sm font-normal text-zinc-900 transition-colors duration-150 placeholder:text-zinc-400";

  const interactiveClasses = disabled
    ? "opacity-60 cursor-not-allowed bg-zinc-50 border-zinc-200"
    : "hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black";

  const variantClasses = {
    default: "h-8 px-3",
    compact: "h-7 px-2",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
