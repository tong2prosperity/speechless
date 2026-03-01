import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useModelStore } from "../../stores/modelStore";
import ModelStatusButton from "../model-selector/ModelStatusButton";
import { useSettings } from "../../hooks/useSettings";

/**
 * LlmSelector component for the footer status bar.
 * Allows users to see the current local LLM status and switch between models.
 */
const LlmSelector: React.FC = () => {
  const { t } = useTranslation();
  const {
    llmModels,
    currentLlmId,
    llmDownloaded,
    llmDownloading,
    llmDownloadProgress,
    selectLlmModel,
  } = useModelStore();
  const { getSetting, settings } = useSettings();

  const postProcessEnabled = getSetting("post_process_enabled") || false;
  const postProcessProviderId = getSetting("post_process_provider_id");

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getStatus = () => {
    if (!postProcessEnabled) return "unloaded";
    if (postProcessProviderId !== "navi_llm") return "ready"; // Cloud providers are always "ready"
    if (llmDownloading) return "downloading";
    if (llmDownloaded) return "ready";
    return "unloaded";
  };

  const getDisplayText = () => {
    if (!postProcessEnabled) return `LLM: ${t("common.off")}`;

    if (postProcessProviderId !== "navi_llm") {
      const provider = settings?.post_process_providers?.find(
        (p) => p.id === postProcessProviderId,
      );
      return `LLM: ${provider?.label || postProcessProviderId || "Cloud"}`;
    }

    if (llmDownloading && llmDownloadProgress) {
      const percentage = Math.round(llmDownloadProgress.percentage);
      return `LLM: ${percentage}%`;
    }
    const currentModel = llmModels.find((m) => m.id === currentLlmId);
    return currentModel ? `LLM: ${currentModel.name}` : "LLM: None";
  };

  const handleSelect = async (modelId: string) => {
    await selectLlmModel(modelId);
    setShowDropdown(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <ModelStatusButton
        status={getStatus()}
        displayText={getDisplayText()}
        isDropdownOpen={showDropdown}
        onClick={() => setShowDropdown(!showDropdown)}
      />

      {showDropdown && (
        <div className="absolute bottom-full start-0 mb-2 w-56 bg-background border border-mid-gray/20 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-[10px] font-medium text-text/40 uppercase tracking-wider">
            {postProcessProviderId === "navi_llm"
              ? t("settings.local_llm_model")
              : t("settings.postProcessing.api.provider.title")}
          </div>
          {postProcessProviderId === "navi_llm" ? (
            llmModels.length > 0 ? (
              llmModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model.id)}
                  className={`w-full px-3 py-2 text-start text-xs hover:bg-mid-gray/10 transition-colors flex items-center justify-between ${
                    currentLlmId === model.id
                      ? "bg-logo-primary/5 text-logo-primary font-medium"
                      : "text-text/70"
                  }`}
                >
                  <span>{model.name}</span>
                  {currentLlmId === model.id && (
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-text/40 italic">
                {t("modelSelector.noModelsAvailable")}
              </div>
            )
          ) : (
            <div className="px-3 py-2 text-xs text-text/70">
              {settings?.post_process_providers?.find(
                (p) => p.id === postProcessProviderId,
              )?.label || postProcessProviderId}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LlmSelector;
