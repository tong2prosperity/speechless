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
import { SettingContainer, SettingsGroup, Textarea } from "@/components/ui";
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
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftBinding, setDraftBinding] = useState("");

  const [isRecordingCreateBinding, setIsRecordingCreateBinding] =
    useState(false);
  const [createKeyPressed, setCreateKeyPressed] = useState<string[]>([]);
  const [createRecordedKeys, setCreateRecordedKeys] = useState<string[]>([]);
  const osType = useOsType();

  // For editing
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");

  useEffect(() => {
    // If we are editing and the prompt still exists, keep it.
    // Otherwise reset editing state if prompts change out from under us.
    if (editingPromptId) {
      const exists = prompts.some((p) => p.id === editingPromptId);
      if (!exists) {
        setEditingPromptId(null);
      }
    }
  }, [prompts, editingPromptId]);

  const handleStartEdit = (prompt: {
    id: string;
    name: string;
    prompt: string;
  }) => {
    setEditingPromptId(prompt.id);
    setEditName(prompt.name);
    setEditText(prompt.prompt);
    setIsCreating(false);
  };

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

  const handleUpdatePrompt = async () => {
    if (!editingPromptId || !editName.trim() || !editText.trim()) return;

    try {
      await commands.updatePostProcessPrompt(
        editingPromptId,
        editName.trim(),
        editText.trim(),
      );
      await refreshSettings();
      setEditingPromptId(null);
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

  const handleTogglePrompt = async (promptId: string, enabled: boolean) => {
    try {
      await commands.togglePostProcessPromptEnabled(promptId, enabled);
      await refreshSettings();
    } catch (error) {
      console.error("Failed to toggle prompt:", error);
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
    setEditingPromptId(null);
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

      setCreateKeyPressed((prev) =>
        prev.includes(key) ? prev : [...prev, key],
      );
      setCreateRecordedKeys((prev) =>
        prev.includes(key) ? prev : [...prev, key],
      );
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

  const filteredPrompts = prompts.filter(
    (p) => p.name !== "Improve Transcriptions",
  );
  const hasPrompts = filteredPrompts.length > 0;

  return (
    <SettingContainer
      title={t("settings.postProcessing.prompts.shortcuts.title")}
      description={t("settings.postProcessing.prompts.shortcuts.description")}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-4">
        <Alert variant="info" contained>
          {t("settings.postProcessing.prompts.shortcuts.flowHint")}
        </Alert>

        {!isCreating && !editingPromptId && (
          <div className="flex justify-between items-center bg-mid-gray/5 p-3 rounded-md border border-mid-gray/20">
            <h4 className="text-sm font-semibold">
              {t("settings.postProcessing.prompts.title")}
            </h4>
            <Button onClick={handleStartCreate} variant="primary" size="sm">
              {t("settings.postProcessing.prompts.createNew")}
            </Button>
          </div>
        )}

        {!isCreating && !editingPromptId && (
          <div className="space-y-2">
            {!hasPrompts ? (
              <div className="p-8 text-center bg-mid-gray/5 rounded-md border border-dashed border-mid-gray/30">
                <p className="text-sm text-mid-gray">
                  {t("settings.postProcessing.prompts.createFirst")}
                </p>
              </div>
            ) : (
              filteredPrompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="group relative flex items-center justify-between p-3.5 bg-transparent hover:bg-mid-gray/5 rounded-lg border border-mid-gray/20 transition-all overflow-hidden cursor-default"
                >
                  <div
                    className={`flex flex-col gap-1 min-w-0 pr-4 transition-opacity duration-200 ${prompt.enabled !== false ? "opacity-100" : "opacity-50"}`}
                  >
                    <span className="text-[14px] font-medium truncate text-foreground">
                      {prompt.name}
                    </span>
                    {getSetting("bindings")?.[prompt.id]?.current_binding && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium tracking-wider text-mid-gray bg-mid-gray/10 rounded border border-mid-gray/20 shadow-sm">
                          {formatKeyCombination(
                            getSetting("bindings")![prompt.id]!.current_binding,
                            osType,
                          )}
                        </kbd>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-[11px] bg-white hover:bg-mid-gray/5 dark:bg-white/5 dark:hover:bg-white/10 shadow-sm border border-mid-gray/20 font-medium"
                        onClick={() => handleStartEdit(prompt)}
                      >
                        {t("common.edit")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-[11px] text-red-500 hover:text-red-600 bg-red-50/50 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-900/40 shadow-sm border border-red-100 dark:border-red-900/50 font-medium"
                        onClick={() => handleDeletePrompt(prompt.id)}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>

                    <div className="w-px h-5 bg-mid-gray/20 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prompt.enabled !== false}
                        onChange={(e) =>
                          handleTogglePrompt(prompt.id, e.target.checked)
                        }
                        className="peer sr-only"
                        id={`toggle-${prompt.id}`}
                      />
                      <label
                        htmlFor={`toggle-${prompt.id}`}
                        className={`block h-full w-full rounded-full transition-colors duration-200 cursor-pointer shadow-inner border border-transparent ${
                          prompt.enabled !== false
                            ? "bg-black dark:bg-white"
                            : "bg-mid-gray/30"
                        }`}
                      >
                        <span
                          className={`absolute top-[1px] left-[1px] h-[16px] w-[16px] rounded-full transition-transform duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.15)] ${
                            prompt.enabled !== false
                              ? "translate-x-4 bg-white dark:bg-black"
                              : "translate-x-0 bg-white"
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {editingPromptId && (
          <div className="space-y-4 p-4 border border-logo-primary/30 rounded-lg bg-logo-primary/5 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold text-logo-primary">
                {t("common.edit")} {editName}
              </h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
                  {t("settings.postProcessing.prompts.promptLabel")}
                </label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t(
                    "settings.postProcessing.prompts.promptLabelPlaceholder",
                  )}
                  variant="compact"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
                  {t("settings.postProcessing.prompts.promptInstructions")}
                </label>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder={t(
                    "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                  )}
                  rows={6}
                />
                <p
                  className="text-[11px] text-mid-gray/70 italic"
                  dangerouslySetInnerHTML={{
                    __html: t("settings.postProcessing.prompts.promptTip"),
                  }}
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
                  {t("settings.postProcessing.hotkey.title")}
                </label>
                <ShortcutInput
                  shortcutId={editingPromptId}
                  descriptionMode="tooltip"
                  grouped={false}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-mid-gray/10">
              <Button
                onClick={handleUpdatePrompt}
                variant="primary"
                size="md"
                disabled={!editName.trim() || !editText.trim()}
              >
                {t("common.save")}
              </Button>
              <Button
                onClick={() => setEditingPromptId(null)}
                variant="secondary"
                size="md"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="space-y-4 p-4 border border-logo-primary/30 rounded-lg bg-logo-primary/5 animate-in slide-in-from-top-4 duration-300">
            <h4 className="font-semibold text-logo-primary">
              {t("settings.postProcessing.prompts.createNew")}
            </h4>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
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

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
                  {t("settings.postProcessing.prompts.promptInstructions")}
                </label>
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder={t(
                    "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                  )}
                  rows={6}
                />
                <p
                  className="text-[11px] text-mid-gray/70 italic"
                  dangerouslySetInnerHTML={{
                    __html: t("settings.postProcessing.prompts.promptTip"),
                  }}
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-mid-gray">
                  {t("settings.postProcessing.hotkey.title")}
                </label>
                <div
                  className="px-3 py-2 text-sm font-semibold bg-white border border-mid-gray/20 hover:border-logo-primary/50 cursor-pointer rounded-md transition-all shadow-sm flex items-center justify-between"
                  onClick={() => {
                    setIsRecordingCreateBinding(true);
                    setCreateKeyPressed([]);
                    setCreateRecordedKeys([]);
                  }}
                >
                  <span
                    className={
                      !draftBinding && !isRecordingCreateBinding
                        ? "text-mid-gray/50 font-normal"
                        : ""
                    }
                  >
                    {isRecordingCreateBinding
                      ? createRecordedKeys.length > 0
                        ? formatKeyCombination(
                            createRecordedKeys.join("+"),
                            osType,
                          )
                        : t("settings.general.shortcut.pressKeys")
                      : draftBinding
                        ? formatKeyCombination(draftBinding, osType)
                        : t("settings.general.shortcut.pressKeys")}
                  </span>
                  {isRecordingCreateBinding && (
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>
                <p className="text-[11px] text-mid-gray/60 italic">
                  {t("settings.postProcessing.prompts.createHotkeyHint")}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-mid-gray/10">
              <Button
                onClick={handleCreatePrompt}
                variant="primary"
                size="md"
                disabled={
                  !draftName.trim() || !draftText.trim() || !draftBinding.trim()
                }
              >
                {t("common.create")}
              </Button>
              <Button
                onClick={handleCancelCreate}
                variant="secondary"
                size="md"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

export const PromptsSettingsApi = React.memo(PromptsSettingsApiComponent);
PromptsSettingsApi.displayName = "PromptsSettingsApi";

export const PromptsSettingsList = React.memo(PromptsSettingsPromptsComponent);
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
