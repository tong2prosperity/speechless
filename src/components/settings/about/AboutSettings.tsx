import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { LogDirectory } from "../debug";
import { useSettingsStore } from "../../../stores/settingsStore";
import { commands } from "../../../bindings";

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettingsStore();

  const [version, setVersion] = useState("0.0.2");
  const [invitationCode, setInvitationCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.0.2");
      }
    };

    fetchVersion();
  }, []);

  const handleRedeem = async () => {
    if (!invitationCode.trim()) return;

    setIsRedeeming(true);
    setMessage(null);

    try {
      const result = await commands.verifyInvitationCode(invitationCode.trim());
      if (result.status === "ok") {
        if (result.data) {
          setMessage({
            type: "success",
            text: "Successfully unlocked advanced features!",
          });
          await refreshSettings();
        } else {
          setMessage({ type: "error", text: "Invalid invitation code." });
        }
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "An error occurred. Please try again.",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.about.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped={true}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-sm font-mono">v{version}</span>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.sourceCode.title")}
          description={t("settings.about.sourceCode.description")}
          grouped={true}
        >
          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              openUrl("https://github.com/tong2prosperity/speechless")
            }
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </SettingContainer>

        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.about.acknowledgments.title")}>
        <SettingContainer
          title={t("settings.about.acknowledgments.whisper.title")}
          description={t("settings.about.acknowledgments.whisper.description")}
          grouped={true}
          layout="stacked"
        >
          <div className="text-sm text-mid-gray">
            {t("settings.about.acknowledgments.whisper.details")}
          </div>
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup title="Feature Unlock">
        <SettingContainer
          title="Invitation Code"
          description="Enter an invitation code to unlock advanced features."
          grouped={true}
        >
          <div className="flex flex-col space-y-2 w-full max-w-sm">
            <div className="flex space-x-2">
              <input
                type="text"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                placeholder="Enter code..."
                className="flex-1 px-3 py-1.5 bg-dark-gray border border-light-gray rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={isRedeeming || settings?.is_unlocked}
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleRedeem}
                disabled={
                  isRedeeming || !invitationCode.trim() || settings?.is_unlocked
                }
              >
                {isRedeeming
                  ? "Redeeming..."
                  : settings?.is_unlocked
                    ? "Unlocked"
                    : "Redeem"}
              </Button>
            </div>
            {message && (
              <div
                className={`text-xs ${message.type === "success" ? "text-green-500" : "text-red-500"}`}
              >
                {message.text}
              </div>
            )}
            {settings?.is_unlocked && (
              <div className="text-xs text-mid-gray">
                Current Code:{" "}
                <span className="font-mono">{settings.invitation_code}</span>
              </div>
            )}
          </div>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};
