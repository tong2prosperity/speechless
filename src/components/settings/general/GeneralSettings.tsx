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
  const { audioFeedbackEnabled, getSetting, updateSetting, isUpdating } =
    useSettings();

  const postProcessEnabled = getSetting("post_process_enabled") || false;
  const defaultPrompt = getSetting("default_post_process_prompt") || "";

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-zinc-950 tracking-tight">
          {t("settings.general.title")}
        </h2>
        <p className="text-base text-zinc-500 mt-1">
          {t("settings.general.description") ||
            "Manage core application behavior and audio hardware preferences."}
        </p>
      </div>

      <div className="space-y-6">
        <SettingsGroup title={t("settings.general.group.general") || "General"}>
          <ShortcutInput shortcutId="transcribe" grouped={true} />
          <PushToTalk descriptionMode="tooltip" grouped={true} />
          <PostProcessingToggle descriptionMode="tooltip" grouped={true} />
          {postProcessEnabled && (
            <SettingContainer
              title={t(
                "settings.general.postProcessingToggle.defaultPrompt.title",
              )}
              description={t(
                "settings.general.postProcessingToggle.defaultPrompt.placeholder",
              )}
              descriptionMode="tooltip"
              layout="stacked"
              grouped={true}
            >
              <div className="space-y-2 flex flex-col">
                <Textarea
                  value={defaultPrompt as string}
                  onChange={(e) =>
                    updateSetting("default_post_process_prompt", e.target.value)
                  }
                  placeholder={t(
                    "settings.general.postProcessingToggle.defaultPrompt.placeholder",
                  )}
                  className="w-full text-sm border border-zinc-200 rounded-md p-3 focus:ring-1 focus:ring-black focus:border-black transition-shadow"
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
    </div>
  );
};
