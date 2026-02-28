import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCcw } from "lucide-react";
import { commands } from "@/bindings";
import {
  formatKeyCombination,
  getKeyName,
  normalizeKey,
} from "@/lib/utils/keyboard";

import { Alert } from "../../ui/Alert";
import {
  SettingContainer,
  SettingsGroup,
  Textarea,
} from "@/components/ui";
import { Button } from "../../ui/Button";
import { ResetButton } from "../../ui/ResetButton";
import { Input } from "../../ui/Input";

import { ProviderSelect } from "../PromptsSettingsApi/ProviderSelect";
import { BaseUrlField } from "../PromptsSettingsApi/BaseUrlField";
import { ApiKeyField } from "../PromptsSettingsApi/ApiKeyField";
import { ModelSelect } from "../PromptsSettingsApi/ModelSelect";
import { usePostProcessProviderState } from "../PromptsSettingsApi/usePostProcessProviderState";
import { ShortcutInput } from "../ShortcutInput";
import { useSettings } from "../../../hooks/useSettings";
import { LocalLlmUnloadTimeoutSetting } from "./LocalLlmUnloadTimeout";
import { useOsType } from "@/hooks/useOsType";

const PromptsSettingsApiComponent: React.FC = () => {
  const { t } = useTranslation();
  const state = usePostProcessProviderState();

  return (
    <>
      <SettingContainer
        title={t("settings.postProcessing.api.provider.title")}
        description={t("settings.postProcessing.api.provider.description")}
        descriptionMode="tooltip"
        layout="horizontal"
        grouped={true}
      >
        <div className="flex items-center gap-2">
          <ProviderSelect
            options={state.providerOptions}
            value={state.selectedProviderId}
            onChange={state.handleProviderSelect}
          />
        </div>
      </SettingContainer>

      {state.isAppleProvider ? (
        state.appleIntelligenceUnavailable ? (
          <Alert variant="error" contained>
            {t("settings.postProcessing.api.appleIntelligence.unavailable")}
          </Alert>
        ) : null
      ) : state.isNaviProvider ? (
        <>
          <Alert variant="info" contained>
            {t("settings.postProcessing.api.localLlmInfo")}
          </Alert>
          <LocalLlmUnloadTimeoutSetting />
        </>
      ) : (
        <>
          {state.selectedProvider?.id === "custom" && (
            <SettingContainer
              title={t("settings.postProcessing.api.baseUrl.title")}
              description={t("settings.postProcessing.api.baseUrl.description")}
              descriptionMode="tooltip"
              layout="horizontal"
              grouped={true}
            >
              <div className="flex items-center gap-2">
                <BaseUrlField
                  value={state.baseUrl}
                  onBlur={state.handleBaseUrlChange}
                  placeholder={t(
                    "settings.postProcessing.api.baseUrl.placeholder",
                  )}
                  disabled={state.isBaseUrlUpdating}
                  className="min-w-[380px]"
                />
              </div>
            </SettingContainer>
          )}

          <SettingContainer
            title={t("settings.postProcessing.api.apiKey.title")}
            description={t("settings.postProcessing.api.apiKey.description")}
            descriptionMode="tooltip"
            layout="horizontal"
            grouped={true}
          >
            <div className="flex items-center gap-2">
              <ApiKeyField
                value={state.apiKey}
                onBlur={state.handleApiKeyChange}
                placeholder={t(
                  "settings.postProcessing.api.apiKey.placeholder",
                )}
                disabled={state.isApiKeyUpdating}
                className="min-w-[320px]"
              />
            </div>
          </SettingContainer>
        </>
      )}

      {!state.isAppleProvider && !state.isNaviProvider && (
        <SettingContainer
          title={t("settings.postProcessing.api.model.title")}
          description={
            state.isCustomProvider
              ? t("settings.postProcessing.api.model.descriptionCustom")
              : t("settings.postProcessing.api.model.descriptionDefault")
          }
          descriptionMode="tooltip"
          layout="stacked"
          grouped={true}
        >
          <div className="flex items-center gap-2">
            <ModelSelect
              value={state.model}
              options={state.modelOptions}
              disabled={state.isModelUpdating}
              isLoading={state.isFetchingModels}
              placeholder={
                state.modelOptions.length > 0
                  ? t(
                      "settings.postProcessing.api.model.placeholderWithOptions",
                    )
                  : t("settings.postProcessing.api.model.placeholderNoOptions")
              }
              onSelect={state.handleModelSelect}
              onCreate={state.handleModelCreate}
              onBlur={() => {}}
              className="flex-1 min-w-[380px]"
            />
            <ResetButton
              onClick={state.handleRefreshModels}
              disabled={state.isFetchingModels}
              ariaLabel={t("settings.postProcessing.api.model.refreshModels")}
              className="flex h-10 w-10 items-center justify-center"
            >
              <RefreshCcw
                className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
              />
            </ResetButton>
          </div>
        </SettingContainer>
      )}
    </>
  );
};

const PromptsSettingsPromptsComponent: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, refreshSettings } = useSettings();
  const prompts = getSetting("post_process_prompts") || [];
  const [promptDrafts, setPromptDrafts] = useState<
    Record<string, { name: string; prompt: string }>
  >({});
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftBinding, setDraftBinding] = useState("");
  const [isRecordingCreateBinding, setIsRecordingCreateBinding] = useState(false);
  const [createKeyPressed, setCreateKeyPressed] = useState<string[]>([]);
  const [createRecordedKeys, setCreateRecordedKeys] = useState<string[]>([]);
  const osType = useOsType();

  useEffect(() => {
    const nextDrafts = prompts.reduce<
      Record<string, { name: string; prompt: string }>
    >((acc, prompt) => {
      acc[prompt.id] = { name: prompt.name, prompt: prompt.prompt };
      return acc;
    }, {});
    setPromptDrafts(nextDrafts);
  }, [prompts]);

  const handleCreatePrompt = async () => {
    if (!draftName.trim() || !draftText.trim() || !draftBinding.trim()) return;

    try {
      const result = await commands.addPostProcessPromptWithBinding(
        draftName.trim(),
        draftText.trim(),
        draftBinding.trim(),
      );
      if (result.status === "ok") {
        await refreshSettings();
        setIsCreating(false);
        setDraftBinding("");
        setDraftName("");
        setDraftText("");
      }
    } catch (error) {
      console.error("Failed to create prompt:", error);
    }
  };

  const handleUpdatePrompt = async (promptId: string) => {
    const draft = promptDrafts[promptId];
    if (!draft || !draft.name.trim() || !draft.prompt.trim()) return;

    try {
      await commands.updatePostProcessPrompt(
        promptId,
        draft.name.trim(),
        draft.prompt.trim(),
      );
      await refreshSettings();
    } catch (error) {
      console.error("Failed to update prompt:", error);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!promptId) return;

    try {
      await commands.deletePostProcessPrompt(promptId);
      await refreshSettings();
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setIsRecordingCreateBinding(false);
    setCreateKeyPressed([]);
    setCreateRecordedKeys([]);
    setDraftBinding("");
    setDraftName("");
    setDraftText("");
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setDraftName("");
    setDraftText("");
    setDraftBinding("");
    setIsRecordingCreateBinding(false);
    setCreateKeyPressed([]);
    setCreateRecordedKeys([]);
  };

  useEffect(() => {
    if (!isCreating || !isRecordingCreateBinding) return;

    let cleanup = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (cleanup) return;
      if (e.repeat) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setIsRecordingCreateBinding(false);
        setCreateKeyPressed([]);
        setCreateRecordedKeys([]);
        return;
      }

      e.preventDefault();
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);

      setCreateKeyPressed((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setCreateRecordedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (cleanup) return;

      e.preventDefault();
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);

      const updatedPressed = createKeyPressed.filter((k) => k !== key);
      setCreateKeyPressed(updatedPressed);

      if (updatedPressed.length === 0 && createRecordedKeys.length > 0) {
        const modifiers = [
          "ctrl",
          "control",
          "shift",
          "alt",
          "option",
          "meta",
          "command",
          "cmd",
          "super",
          "win",
          "windows",
        ];
        const sortedKeys = [...createRecordedKeys].sort((a, b) => {
          const aIsModifier = modifiers.includes(a.toLowerCase());
          const bIsModifier = modifiers.includes(b.toLowerCase());
          if (aIsModifier && !bIsModifier) return -1;
          if (!aIsModifier && bIsModifier) return 1;
          return 0;
        });

        setDraftBinding(sortedKeys.join("+"));
        setIsRecordingCreateBinding(false);
        setCreateKeyPressed([]);
        setCreateRecordedKeys([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      cleanup = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isCreating,
    isRecordingCreateBinding,
    createKeyPressed,
    createRecordedKeys,
    osType,
  ]);

  const hasPrompts = prompts.length > 0;

  return (
    <SettingContainer
      title={t("settings.postProcessing.prompts.shortcuts.title")}
      description={t(
        "settings.postProcessing.prompts.shortcuts.description",
      )}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-3">
        <Alert variant="info" contained>
          {t("settings.postProcessing.prompts.shortcuts.flowHint")}
        </Alert>

        <div className="flex gap-2">
          <Button
            onClick={handleStartCreate}
            variant="primary"
            size="md"
            disabled={isCreating}
          >
            {t("settings.postProcessing.prompts.createNew")}
          </Button>
        </div>

        {!isCreating && !hasPrompts && (
          <div className="p-3 bg-mid-gray/5 rounded-md border border-mid-gray/20">
            <p className="text-sm text-mid-gray">
              {t("settings.postProcessing.prompts.createFirst")}
            </p>
          </div>
        )}

        {!isCreating &&
          prompts.map((prompt) => {
            const draft = promptDrafts[prompt.id] ?? {
              name: prompt.name,
              prompt: prompt.prompt,
            };
            const isDirty =
              draft.name.trim() !== prompt.name.trim() ||
              draft.prompt.trim() !== prompt.prompt.trim();

            return (
              <div
                key={prompt.id}
                className="space-y-3 rounded-md border border-mid-gray/20 bg-mid-gray/5 p-3"
              >
                <div className="space-y-2 flex flex-col">
                  <label className="text-sm font-semibold">
                    {t("settings.postProcessing.prompts.promptLabel")}
                  </label>
                  <Input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setPromptDrafts((prev) => ({
                        ...prev,
                        [prompt.id]: {
                          ...draft,
                          name: e.target.value,
                        },
                      }))
                    }
                    placeholder={t(
                      "settings.postProcessing.prompts.promptLabelPlaceholder",
                    )}
                    variant="compact"
                  />
                </div>

                <div className="space-y-2 flex flex-col">
                  <label className="text-sm font-semibold">
                    {t("settings.postProcessing.prompts.promptInstructions")}
                  </label>
                  <Textarea
                    value={draft.prompt}
                    onChange={(e) =>
                      setPromptDrafts((prev) => ({
                        ...prev,
                        [prompt.id]: {
                          ...draft,
                          prompt: e.target.value,
                        },
                      }))
                    }
                    placeholder={t(
                      "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                    )}
                  />
                  <p
                    className="text-xs text-mid-gray/70"
                    dangerouslySetInnerHTML={{
                      __html: t("settings.postProcessing.prompts.promptTip"),
                    }}
                  />
                </div>

                <ShortcutInput
                  shortcutId={prompt.id}
                  descriptionMode="tooltip"
                  grouped={false}
                />

                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={() => handleUpdatePrompt(prompt.id)}
                    variant="primary"
                    size="md"
                    disabled={
                      !draft.name.trim() || !draft.prompt.trim() || !isDirty
                    }
                  >
                    {t("settings.postProcessing.prompts.updatePrompt")}
                  </Button>
                  <Button
                    onClick={() => handleDeletePrompt(prompt.id)}
                    variant="secondary"
                    size="md"
                    disabled={prompts.length <= 1}
                  >
                    {t("settings.postProcessing.prompts.deletePrompt")}
                  </Button>
                </div>
              </div>
            );
          })}

        {isCreating && (
          <div className="space-y-3">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold text-text">
                {t("settings.postProcessing.prompts.promptLabel")}
              </label>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptLabelPlaceholder",
                )}
                variant="compact"
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptInstructions")}
              </label>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                )}
              />
              <p
                className="text-xs text-mid-gray/70"
                dangerouslySetInnerHTML={{
                  __html: t("settings.postProcessing.prompts.promptTip"),
                }}
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.hotkey.title")}
              </label>
              <div
                className="px-2 py-2 text-sm font-semibold bg-mid-gray/10 border border-mid-gray/80 hover:bg-logo-primary/10 rounded-md cursor-pointer hover:border-logo-primary"
                onClick={() => {
                  setIsRecordingCreateBinding(true);
                  setCreateKeyPressed([]);
                  setCreateRecordedKeys([]);
                }}
              >
                {isRecordingCreateBinding
                  ? createRecordedKeys.length > 0
                    ? formatKeyCombination(createRecordedKeys.join("+"), osType)
                    : t("settings.general.shortcut.pressKeys")
                  : draftBinding
                    ? formatKeyCombination(draftBinding, osType)
                    : t("settings.general.shortcut.pressKeys")}
              </div>
              <p className="text-xs text-mid-gray/70">
                {t("settings.postProcessing.prompts.createHotkeyHint")}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreatePrompt}
                variant="primary"
                size="md"
                disabled={
                  !draftName.trim() || !draftText.trim() || !draftBinding.trim()
                }
              >
                {t("settings.postProcessing.prompts.createPrompt")}
              </Button>
              <Button
                onClick={handleCancelCreate}
                variant="secondary"
                size="md"
              >
                {t("settings.postProcessing.prompts.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

export const PromptsSettingsApi = React.memo(
  PromptsSettingsApiComponent,
);
PromptsSettingsApi.displayName = "PromptsSettingsApi";

export const PromptsSettingsList = React.memo(
  PromptsSettingsPromptsComponent,
);
PromptsSettingsList.displayName = "PromptsSettingsList";

export const PromptsSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.postProcessing.prompts.title")}>
        <PromptsSettingsList />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.api.title")}>
        <PromptsSettingsApi />
      </SettingsGroup>
    </div>
  );
};
