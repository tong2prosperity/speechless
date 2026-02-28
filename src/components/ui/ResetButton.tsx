import React from "react";
import ResetIcon from "../icons/ResetIcon";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const ResetButton: React.FC<ResetButtonProps> = React.memo(
  ({ onClick, disabled = false, className = "", ariaLabel, children }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`p-1.5 rounded-md border transition-all duration-150 ${
        disabled
          ? "opacity-50 cursor-not-allowed text-zinc-400 border-zinc-200 bg-zinc-50"
          : "text-zinc-400 border-zinc-200 bg-white hover:text-zinc-900 hover:bg-zinc-100 hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black"
      } ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children ?? <ResetIcon />}
    </button>
  ),
);
