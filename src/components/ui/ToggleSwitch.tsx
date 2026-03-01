import React from "react";
import { SettingContainer } from "./SettingContainer";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  tooltipPosition = "top",
}) => {
  const switchId = React.useId();
  const isDisabled = disabled || isUpdating;

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      <div className="relative inline-flex items-center w-10 h-5 align-middle select-none">
        <input
          type="checkbox"
          name={switchId}
          id={switchId}
          checked={checked}
          disabled={isDisabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <label
          htmlFor={switchId}
          className={`relative block h-5 w-10 rounded-full transition-colors duration-200 ${
            checked ? "bg-black" : "bg-zinc-300"
          } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full flex items-center justify-center transition-all duration-200 ${
              checked
                ? "left-[22px] bg-[#2563eb]"
                : "left-0.5 bg-white shadow-sm"
            }`}
          >
            {checked && (
              <svg
                viewBox="0 0 28 28"
                fill="none"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-2.5 h-2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        </label>
      </div>
    </SettingContainer>
  );
};
