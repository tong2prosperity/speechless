import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce } from "immer";
import { listen } from "@tauri-apps/api/event";
import {
  commands,
  type ModelInfo,
  type LlmModelInfo,
  type Result,
} from "@/bindings";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number; // MB/s
}

// Using Record instead of Set/Map for Immer compatibility
interface ModelsStore {
  models: ModelInfo[];
  currentModel: string;
  downloadingModels: Record<string, true>;
  extractingModels: Record<string, true>;
  downloadProgress: Record<string, DownloadProgress>;
  downloadStats: Record<string, DownloadStats>;
  loading: boolean;
  error: string | null;
  hasAnyModels: boolean;
  isFirstRun: boolean;
  initialized: boolean;
  llmDownloaded: boolean;
  llmDownloading: boolean;
  llmDownloadProgress: DownloadProgress | undefined;
  llmDownloadStats: DownloadStats | undefined;
  llmModels: LlmModelInfo[];
  currentLlmId: string;

  // Actions
  initialize: () => Promise<void>;
  loadModels: () => Promise<void>;
  loadCurrentModel: () => Promise<void>;
  checkFirstRun: () => Promise<boolean>;
  selectModel: (modelId: string) => Promise<boolean>;
  downloadModel: (modelId: string) => Promise<boolean>;
  cancelDownload: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
  getModelInfo: (modelId: string) => ModelInfo | undefined;
  isModelDownloading: (modelId: string) => boolean;
  isModelExtracting: (modelId: string) => boolean;
  getDownloadProgress: (modelId: string) => DownloadProgress | undefined;
  loadLlmModels: () => Promise<void>;
  downloadLlm: (modelId: string) => Promise<boolean>;
  selectLlmModel: (modelId: string) => Promise<boolean>;
  cancelLlmDownload: (modelId: string) => Promise<boolean>;
  deleteLlm: (modelId: string) => Promise<boolean>;
  checkLlmStatus: () => Promise<void>;

  // Internal setters
  setModels: (models: ModelInfo[]) => void;
  setCurrentModel: (modelId: string) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useModelStore = create<ModelsStore>()(
  subscribeWithSelector((set, get) => ({
    models: [],
    currentModel: "",
    downloadingModels: {},
    extractingModels: {},
    downloadProgress: {},
    downloadStats: {},
    loading: true,
    error: null,
    hasAnyModels: false,
    isFirstRun: false,
    initialized: false,
    llmDownloaded: false,
    llmDownloading: false,
    llmDownloadProgress: undefined,
    llmDownloadStats: undefined,
    llmModels: [],
    currentLlmId: "",

    // Internal setters
    setModels: (models) => set({ models }),
    setCurrentModel: (currentModel) => set({ currentModel }),
    setError: (error) => set({ error }),
    setLoading: (loading) => set({ loading }),

    loadModels: async () => {
      try {
        const result = await commands.getAvailableModels();
        if (result.status === "ok") {
          set({ models: result.data, error: null });

          // Sync downloading state from backend
          set(
            produce((state) => {
              const backendDownloading: Record<string, true> = {};
              result.data
                .filter((m) => m.is_downloading)
                .forEach((m) => {
                  backendDownloading[m.id] = true;
                });

              // Merge: keep frontend state if downloading, add backend state
              Object.keys(backendDownloading).forEach((id) => {
                state.downloadingModels[id] = true;
              });

              // Remove models that backend says are NOT downloading AND
              // frontend doesn't have progress for (completed/cancelled)
              Object.keys(state.downloadingModels).forEach((id) => {
                if (!backendDownloading[id] && !state.downloadProgress[id]) {
                  delete state.downloadingModels[id];
                }
              });
            }),
          );
        } else {
          set({ error: `Failed to load models: ${result.error}` });
        }
      } catch (err) {
        set({ error: `Failed to load models: ${err}` });
      } finally {
        set({ loading: false });
      }
    },

    loadCurrentModel: async () => {
      try {
        const result = await commands.getCurrentModel();
        if (result.status === "ok") {
          set({ currentModel: result.data });
        }
      } catch (err) {
        console.error("Failed to load current model:", err);
      }
    },

    checkFirstRun: async () => {
      try {
        const result = await commands.hasAnyModelsAvailable();
        if (result.status === "ok") {
          const hasModels = result.data;
          set({ hasAnyModels: hasModels, isFirstRun: !hasModels });
          return !hasModels;
        }
        return false;
      } catch (err) {
        console.error("Failed to check model availability:", err);
        return false;
      }
    },

    selectModel: async (modelId: string) => {
      try {
        set({ error: null });
        const result = await commands.setActiveModel(modelId);
        if (result.status === "ok") {
          set({
            currentModel: modelId,
            isFirstRun: false,
            hasAnyModels: true,
          });
          return true;
        } else {
          set({ error: `Failed to switch to model: ${result.error}` });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to switch to model: ${err}` });
        return false;
      }
    },

    downloadModel: async (modelId: string) => {
      try {
        set({ error: null });
        set(
          produce((state) => {
            state.downloadingModels[modelId] = true;
            state.downloadProgress[modelId] = {
              model_id: modelId,
              downloaded: 0,
              total: 0,
              percentage: 0,
            };
          }),
        );
        const result = await commands.downloadModel(modelId);
        if (result.status === "ok") {
          return true;
        } else {
          set({ error: `Failed to download model: ${result.error}` });
          set(
            produce((state) => {
              delete state.downloadingModels[modelId];
            }),
          );
          return false;
        }
      } catch (err) {
        set({ error: `Failed to download model: ${err}` });
        set(
          produce((state) => {
            delete state.downloadingModels[modelId];
          }),
        );
        return false;
      }
    },

    cancelDownload: async (modelId: string) => {
      try {
        set({ error: null });
        const result = await commands.cancelDownload(modelId);
        if (result.status === "ok") {
          set(
            produce((state) => {
              delete state.downloadingModels[modelId];
              delete state.downloadProgress[modelId];
              delete state.downloadStats[modelId];
            }),
          );

          // Reload models to sync with backend state
          await get().loadModels();
          return true;
        } else {
          set({ error: `Failed to cancel download: ${result.error}` });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to cancel download: ${err}` });
        return false;
      }
    },

    deleteModel: async (modelId: string) => {
      try {
        set({ error: null });
        const result = await commands.deleteModel(modelId);
        if (result.status === "ok") {
          await get().loadModels();
          await get().loadCurrentModel();
          return true;
        } else {
          set({ error: `Failed to delete model: ${result.error}` });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to delete model: ${err}` });
        return false;
      }
    },

    getModelInfo: (modelId: string) => {
      return get().models.find((model) => model.id === modelId);
    },

    isModelDownloading: (modelId: string) => {
      return modelId in get().downloadingModels;
    },

    isModelExtracting: (modelId: string) => {
      return modelId in get().extractingModels;
    },

    getDownloadProgress: (modelId: string) => {
      return get().downloadProgress[modelId];
    },

    loadLlmModels: async () => {
      try {
        const result = await commands.getAvailableLlmModels();
        if (result.status === "ok") {
          set({ llmModels: result.data });
        }
      } catch (err) {
        console.error("Failed to load LLM models:", err);
      }
    },

    downloadLlm: async (modelId: string) => {
      try {
        set({
          error: null,
          llmDownloading: true,
          llmDownloadProgress: {
            model_id: modelId,
            downloaded: 0,
            total: 0,
            percentage: 0,
          },
        });
        const result = await commands.downloadLocalLlm(modelId);
        if (result.status === "ok") {
          return true;
        } else {
          set({
            error: `Failed to download LLM: ${result.error}`,
            llmDownloading: false,
          });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to download LLM: ${err}`, llmDownloading: false });
        return false;
      }
    },

    cancelLlmDownload: async (modelId: string) => {
      try {
        set({ error: null });
        const result = await commands.cancelLocalLlmDownload(modelId);
        if (result.status === "ok") {
          set({
            llmDownloading: false,
            llmDownloadProgress: undefined,
            llmDownloadStats: undefined,
          });
          return true;
        } else {
          set({ error: `Failed to cancel LLM download: ${result.error}` });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to cancel LLM download: ${err}` });
        return false;
      }
    },

    deleteLlm: async (modelId: string) => {
      try {
        set({ error: null });
        const result = await commands.deleteLocalLlm(modelId);
        if (result.status === "ok") {
          set({ llmDownloaded: false });
          return true;
        } else {
          set({ error: `Failed to delete LLM: ${result.error}` });
          return false;
        }
      } catch (err) {
        set({ error: `Failed to delete LLM: ${err}` });
        return false;
      }
    },

    selectLlmModel: async (modelId: string) => {
      try {
        const result = await commands.changePostProcessModelSetting(
          "navi_llm",
          modelId,
        );
        if (result.status === "ok") {
          set({ currentLlmId: modelId });
          // Re-check download status when switching models
          await get().checkLlmStatus();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to select LLM model:", err);
        return false;
      }
    },

    checkLlmStatus: async () => {
      try {
        const result = await commands.checkLocalLlmDownloaded();
        if (result.status === "ok") {
          set({ llmDownloaded: result.data });
        }

        // Also sync currentLlmId from settings
        const settingsResult = await commands.getAppSettings();
        if (settingsResult.status === "ok") {
          const models = settingsResult.data.post_process_models;
          if (models && models["navi_llm"]) {
            set({ currentLlmId: models["navi_llm"] });
          } else {
            // Default if not set
            set({ currentLlmId: "qwen3-4b" });
          }
        }
      } catch (err) {
        console.error("Failed to check LLM status:", err);
      }
    },

    initialize: async () => {
      if (get().initialized) return;

      const {
        loadModels,
        loadCurrentModel,
        checkFirstRun,
        checkLlmStatus,
        loadLlmModels,
      } = get();

      // Load initial data
      await Promise.all([
        loadModels(),
        loadCurrentModel(),
        checkFirstRun(),
        checkLlmStatus(),
        loadLlmModels(),
      ]);

      // Set up event listeners
      listen<DownloadProgress>("model-download-progress", (event) => {
        const progress = event.payload;
        const isLlm = get().llmModels.some((m) => m.id === progress.model_id);
        if (isLlm) {
          set({
            llmDownloadProgress: progress,
            llmDownloading: progress.percentage < 100,
          });

          // Update LLM stats
          const now = Date.now();
          set(
            produce((state) => {
              const current = state.llmDownloadStats;

              if (!current) {
                state.llmDownloadStats = {
                  startTime: now,
                  lastUpdate: now,
                  totalDownloaded: progress.downloaded,
                  speed: 0,
                };
              } else {
                const timeDiff = (now - current.lastUpdate) / 1000;
                const bytesDiff = progress.downloaded - current.totalDownloaded;

                if (timeDiff > 0.5) {
                  const currentSpeed = bytesDiff / (1024 * 1024) / timeDiff;
                  const validCurrentSpeed = Math.max(0, currentSpeed);
                  const smoothedSpeed =
                    current.speed > 0
                      ? current.speed * 0.8 + validCurrentSpeed * 0.2
                      : validCurrentSpeed;

                  state.llmDownloadStats = {
                    startTime: current.startTime,
                    lastUpdate: now,
                    totalDownloaded: progress.downloaded,
                    speed: Math.max(0, smoothedSpeed),
                  };
                }
              }
            }),
          );
          return;
        }
        set(
          produce((state) => {
            state.downloadProgress[progress.model_id] = progress;
          }),
        );

        // Update download stats for speed calculation
        const now = Date.now();
        set(
          produce((state) => {
            const current = state.downloadStats[progress.model_id];

            if (!current) {
              state.downloadStats[progress.model_id] = {
                startTime: now,
                lastUpdate: now,
                totalDownloaded: progress.downloaded,
                speed: 0,
              };
            } else {
              const timeDiff = (now - current.lastUpdate) / 1000;
              const bytesDiff = progress.downloaded - current.totalDownloaded;

              if (timeDiff > 0.5) {
                const currentSpeed = bytesDiff / (1024 * 1024) / timeDiff;
                const validCurrentSpeed = Math.max(0, currentSpeed);
                const smoothedSpeed =
                  current.speed > 0
                    ? current.speed * 0.8 + validCurrentSpeed * 0.2
                    : validCurrentSpeed;

                state.downloadStats[progress.model_id] = {
                  startTime: current.startTime,
                  lastUpdate: now,
                  totalDownloaded: progress.downloaded,
                  speed: Math.max(0, smoothedSpeed),
                };
              }
            }
          }),
        );
      });

      listen<string>("model-download-complete", (event) => {
        const modelId = event.payload;
        const isLlm = get().llmModels.some((m) => m.id === modelId);
        if (isLlm) {
          set({ llmDownloading: false, llmDownloaded: true });
          return;
        }
        set(
          produce((state) => {
            delete state.downloadingModels[modelId];
            delete state.downloadProgress[modelId];
            delete state.downloadStats[modelId];
          }),
        );
        get().loadModels();
      });

      listen<string>("model-extraction-started", (event) => {
        const modelId = event.payload;
        set(
          produce((state) => {
            state.extractingModels[modelId] = true;
          }),
        );
      });

      listen<string>("model-extraction-completed", (event) => {
        const modelId = event.payload;
        set(
          produce((state) => {
            delete state.extractingModels[modelId];
          }),
        );
        get().loadModels();
      });

      listen<{ model_id: string; error: string }>(
        "model-extraction-failed",
        (event) => {
          const modelId = event.payload.model_id;
          set(
            produce((state) => {
              delete state.extractingModels[modelId];
              state.error = `Failed to extract model: ${event.payload.error}`;
            }),
          );
        },
      );

      listen<string>("model-download-cancelled", (event) => {
        const modelId = event.payload;
        set(
          produce((state) => {
            delete state.downloadingModels[modelId];
            delete state.downloadProgress[modelId];
            delete state.downloadStats[modelId];
          }),
        );
      });

      listen<string>("llm-download-cancelled", () => {
        set({
          llmDownloading: false,
          llmDownloadProgress: undefined,
          llmDownloadStats: undefined,
        });
      });

      listen<string>("llm-model-deleted", () => {
        set({ llmDownloaded: false });
      });

      listen<string>("model-deleted", () => {
        get().loadModels();
        get().loadCurrentModel();
      });

      listen("model-state-changed", () => {
        get().loadModels();
        get().loadCurrentModel();
      });

      set({ initialized: true });
    },
  })),
);
