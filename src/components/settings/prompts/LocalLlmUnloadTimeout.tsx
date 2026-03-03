import React from "react";
import { useTranslation } from "react-i18next";
import { type LocalLlmUnloadTimeout } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { Dropdown } from "@/components/ui/Dropdown";
import { SettingContainer } from "@/components/ui/SettingContainer";

interface LocalLlmUnloadTimeoutSettingProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const LocalLlmUnloadTimeoutSetting: React.FC<
  LocalLlmUnloadTimeoutSettingProps
> = ({ descriptionMode = "tooltip", grouped = true }) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();

  const options = [
    {
      value: "hour1" as LocalLlmUnloadTimeout,
      label: t("settings.postProcessing.api.localLlmUnload.options.hour1"),
    },
    {
      value: "hour3" as LocalLlmUnloadTimeout,
      label: t("settings.postProcessing.api.localLlmUnload.options.hour3"),
    },
    {
      value: "never" as LocalLlmUnloadTimeout,
      label: t("settings.postProcessing.api.localLlmUnload.options.never"),
    },
  ];

  const currentValue =
    (getSetting("local_llm_unload_timeout") as LocalLlmUnloadTimeout) ??
    "hour1";

  const handleChange = async (value: string | null) => {
    if (!value) return;
    const timeout = value as LocalLlmUnloadTimeout;
    try {
      await updateSetting("local_llm_unload_timeout", timeout as any);
    } catch (error) {
      console.error("Failed to update local LLM unload timeout:", error);
    }
  };

  return (
    <SettingContainer
      title={t("settings.postProcessing.api.localLlmUnload.title")}
      description={t("settings.postProcessing.api.localLlmUnload.description")}
      descriptionMode={descriptionMode}
      layout="horizontal"
      grouped={grouped}
    >
      <Dropdown
        options={options}
        selectedValue={currentValue}
        onSelect={handleChange}
      />
    </SettingContainer>
  );
};
