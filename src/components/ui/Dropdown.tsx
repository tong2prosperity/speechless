import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  isHeader?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`h-8 min-w-[220px] max-w-[280px] px-3 text-sm bg-white border border-zinc-300 rounded-md text-start flex items-center justify-between transition-colors duration-150 ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-zinc-50 border-zinc-200"
            : "hover:border-zinc-400 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black"
        }`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className="truncate text-zinc-900">
          {selectedOption?.label || placeholder}
        </span>
        <svg
          className={`w-4 h-4 ms-2 text-zinc-500 transition-transform duration-200 ${isOpen ? "transform rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) =>
              option.isHeader ? (
                <div
                  key={option.value}
                  className="px-3 pt-2 pb-1 mt-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider pointer-events-none"
                >
                  {option.label}
                </div>
              ) : (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full px-3 py-1.5 text-sm text-start transition-colors duration-150 ${
                    selectedValue === option.value
                      ? "bg-zinc-100 text-zinc-900 font-medium"
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                  } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              )
            )
          )}
        </div>
      )}
    </div>
  );
};
