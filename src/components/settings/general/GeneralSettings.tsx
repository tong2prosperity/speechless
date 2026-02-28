import React from "react";
import { useTranslation } from "react-i18next";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { ModelSettingsCard } from "./ModelSettingsCard";
import { PostProcessingToggle } from "../PostProcessingToggle";
import { SettingContainer, Textarea } from "../../ui";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting, updateSetting, isUpdating } = useSettings();
  
  const postProcessEnabled = getSetting("post_process_enabled") || false;
  const defaultPrompt = getSetting("default_post_process_prompt") || "";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        <PostProcessingToggle descriptionMode="tooltip" grouped={true} />
        {postProcessEnabled && (
          <SettingContainer
            title={t("settings.general.postProcessingToggle.defaultPrompt.title")}
            description={t("settings.general.postProcessingToggle.defaultPrompt.placeholder")}
            descriptionMode="tooltip"
            layout="stacked"
            grouped={true}
          >
            <div className="space-y-2 flex flex-col">
              <Textarea
                value={defaultPrompt as string}
                onChange={(e) => updateSetting("default_post_process_prompt", e.target.value)}
                disabled={isUpdating("default_post_process_prompt")}
                placeholder={t(
                  "settings.general.postProcessingToggle.defaultPrompt.placeholder",
                )}
                rows={4}
              />
            </div>
          </SettingContainer>
        )}
      </SettingsGroup>
      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>
    </div>
  );
};
