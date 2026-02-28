import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close tooltip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTooltip]);

  const toggleTooltip = () => {
    setShowTooltip(!showTooltip);
  };

  const containerClasses = `px-5 py-4 flex items-center justify-between gap-4 transition-colors ${
    disabled ? "opacity-50" : "hover:bg-zinc-50"
  }`;

  if (layout === "stacked") {
    return (
      <div
        className={`px-5 py-4 block transition-colors ${disabled ? "opacity-50" : "hover:bg-zinc-50"}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-medium text-zinc-900">{title}</h3>
          <div
            ref={tooltipRef}
            className="relative flex items-center"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={toggleTooltip}
          >
            <span
              className="material-symbols-outlined text-[16px] text-zinc-400 cursor-help hover:text-zinc-900 transition-colors"
              title={descriptionMode === "tooltip" ? "" : description}
            >
              info
            </span>
            {showTooltip && descriptionMode === "tooltip" && (
              <Tooltip targetRef={tooltipRef} position="top">
                <p className="text-sm text-center leading-relaxed text-zinc-700">
                  {description}
                </p>
              </Tooltip>
            )}
          </div>
        </div>
        {descriptionMode === "inline" && (
          <p className="mb-3 text-sm text-zinc-500">{description}</p>
        )}
        <div className="w-full">{children}</div>
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className={containerClasses}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-base font-medium ${disabled ? "text-zinc-400" : "text-zinc-900"}`}
          >
            {title}
          </span>
          <div
            ref={tooltipRef}
            className="relative flex items-center"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={toggleTooltip}
          >
            <span
              className="material-symbols-outlined text-[16px] text-zinc-400 cursor-help hover:text-zinc-900 transition-colors"
              title={descriptionMode === "tooltip" ? "" : description}
            >
              info
            </span>
            {showTooltip && descriptionMode === "tooltip" && (
              <Tooltip targetRef={tooltipRef} position={tooltipPosition}>
                <p className="text-sm text-center leading-relaxed text-zinc-700">
                  {description}
                </p>
              </Tooltip>
            )}
          </div>
        </div>
        {descriptionMode === "inline" && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      <div className="relative flex-shrink-0">{children}</div>
    </div>
  );
};
