use crate::settings::{get_settings, write_settings};
use anyhow::Result;
use async_trait::async_trait;
use log::{debug, info, warn};
use modelscope_ng::{ModelScope, ProgressCallback};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum EngineType {
    ParakeetSherpa,
    SenseVoiceSherpa,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub is_directory: bool,
    pub engine_type: EngineType,
    pub accuracy_score: f32,        // 0.0 to 1.0, higher is more accurate
    pub speed_score: f32,           // 0.0 to 1.0, higher is faster
    pub supports_translation: bool, // Whether the model supports translating to English
    pub is_recommended: bool,       // Whether this is the recommended model for new users
    pub supported_languages: Vec<String>, // Languages this model can transcribe
    pub is_custom: bool,            // Whether this is a user-provided custom model
    pub model_scope_repo: Option<String>, // ModelScope repository ID
    pub model_scope_files: Option<Vec<String>>, // List of files tracked in ModelScope
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

pub struct ModelManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    available_models: Mutex<HashMap<String, ModelInfo>>,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

const ASR_COLLECTION_REPO_ID: &str = "trevorlink/asr-collection";

#[derive(Clone)]
struct ModelScopeProgressCallback {
    app_handle: AppHandle,
    model_id: String,
    progress_by_file: Arc<Mutex<HashMap<String, (u64, u64)>>>,
}

impl ModelScopeProgressCallback {
    fn emit_aggregated_progress(&self) {
        let (downloaded, total) = {
            let progress = self.progress_by_file.lock().unwrap();
            progress
                .values()
                .fold((0_u64, 0_u64), |(d_acc, t_acc), (d, t)| {
                    (d_acc + d, t_acc + t)
                })
        };

        let percentage = if total > 0 {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        let progress = DownloadProgress {
            model_id: self.model_id.clone(),
            downloaded,
            total,
            percentage,
        };
        let _ = self.app_handle.emit("model-download-progress", &progress);
    }
}

#[async_trait]
impl ProgressCallback for ModelScopeProgressCallback {
    async fn on_file_start(&self, file_name: &str, file_size: u64) {
        {
            let mut progress = self.progress_by_file.lock().unwrap();
            progress.insert(file_name.to_string(), (0, file_size));
        }
        self.emit_aggregated_progress();
    }

    async fn on_file_progress(&self, file_name: &str, downloaded: u64, total: u64) {
        {
            let mut progress = self.progress_by_file.lock().unwrap();
            progress.insert(file_name.to_string(), (downloaded, total));
        }
        self.emit_aggregated_progress();
    }

    async fn on_file_complete(&self, file_name: &str) {
        {
            let mut progress = self.progress_by_file.lock().unwrap();
            if let Some((downloaded, total)) = progress.get_mut(file_name) {
                if *total > 0 {
                    *downloaded = *total;
                }
            }
        }
        self.emit_aggregated_progress();
    }

    async fn on_file_error(&self, _file_name: &str, _error: &str) {}
}

impl ModelManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Create models directory in app data
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?
            .join("models");

        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let mut available_models = HashMap::new();
        // Add NVIDIA Parakeet V3 models (directory-based)
        available_models.insert(
            "parakeet-tdt-0.6b-v3".to_string(),
            ModelInfo {
                id: "parakeet-tdt-0.6b-v3".to_string(),
                name: "Parakeet V3".to_string(),
                description: "English only. Latest generation Parakeet model for highest accuracy."
                    .to_string(),
                filename: "parakeet-tdt-0.6b-v3-int8".to_string(), // Directory name
                url: None,                                         // Downloaded via ModelScope
                size_mb: 475,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_directory: true,
                engine_type: EngineType::ParakeetSherpa,
                accuracy_score: 0.92,
                speed_score: 0.82,
                supports_translation: false,
                is_recommended: true,
                supported_languages: vec!["en".to_string()],
                is_custom: false,
                model_scope_repo: Some(ASR_COLLECTION_REPO_ID.to_string()),
                model_scope_files: Some(vec![
                    "parakeet-0.6b-v3/decoder.int8.onnx".to_string(),
                    "parakeet-0.6b-v3/encoder.int8.onnx".to_string(),
                    "parakeet-0.6b-v3/joiner.int8.onnx".to_string(),
                    "parakeet-0.6b-v3/tokens.txt".to_string(),
                ]),
            },
        );

        // SenseVoice supported languages
        let sense_voice_languages: Vec<String> =
            vec!["zh", "zh-Hans", "zh-Hant", "en", "yue", "ja", "ko"]
                .into_iter()
                .map(String::from)
                .collect();
        available_models.insert(
            "sense-voice-int8".to_string(),
            ModelInfo {
                id: "sense-voice-int8".to_string(),
                name: "SenseVoice".to_string(),
                description: "Very fast. Chinese, English, Japanese, Korean, Cantonese."
                    .to_string(),
                filename: "sense-voice-int8".to_string(),
                url: None,
                size_mb: 160,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_directory: true,
                engine_type: EngineType::SenseVoiceSherpa,
                accuracy_score: 0.85,
                speed_score: 0.95,
                supports_translation: false,
                is_recommended: false,
                supported_languages: sense_voice_languages.clone(),
                is_custom: false,
                model_scope_repo: Some(ASR_COLLECTION_REPO_ID.to_string()),
                model_scope_files: Some(vec![
                    "sense_voice/model.int8.onnx".to_string(),
                    "sense_voice/tokens.txt".to_string(),
                    "sense_voice/silero_v6.onnx".to_string(),
                ]),
            },
        );

        // Conditionally add SenseVoice Sherpa if it has been manually downloaded
        let sherpa_dir = models_dir.join("sense-voice-sherpa-int8");
        if sherpa_dir.exists() {
            available_models.insert(
                "sense-voice-sherpa".to_string(),
                ModelInfo {
                    id: "sense-voice-sherpa".to_string(),
                    name: "SenseVoice Sherpa".to_string(),
                    description:
                        "Very fast. Chinese, English, Japanese, Korean, Cantonese. (Sherpa Engine)"
                            .to_string(),
                    filename: "sense-voice-sherpa-int8".to_string(),
                    url: None, // No download URL, user must provide the model manually
                    size_mb: 160,
                    is_downloaded: true, // we only insert it if it exists
                    is_downloading: false,
                    partial_size: 0,
                    is_directory: true,
                    engine_type: EngineType::SenseVoiceSherpa,
                    accuracy_score: 0.65,
                    speed_score: 0.95,
                    supports_translation: false,
                    is_recommended: false,
                    supported_languages: sense_voice_languages.clone(),
                    is_custom: true, // Marked as custom since it is not automatically downloadable
                    model_scope_repo: None,
                    model_scope_files: None,
                },
            );
        }

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            available_models: Mutex::new(available_models),
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        };

        // Migrate any bundled models to user directory
        manager.migrate_bundled_models()?;

        // Check which models are already downloaded
        manager.update_download_status()?;

        // Auto-select a model if none is currently selected
        manager.auto_select_model_if_needed()?;

        Ok(manager)
    }

    pub fn get_available_models(&self) -> Vec<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.values().cloned().collect()
    }

    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.get(model_id).cloned()
    }

    fn migrate_bundled_models(&self) -> Result<()> {
        // Check for bundled models and copy them to user directory
        let bundled_models = ["ggml-small.bin"]; // Add other bundled models here if any

        for filename in &bundled_models {
            let bundled_path = self.app_handle.path().resolve(
                &format!("resources/models/{}", filename),
                tauri::path::BaseDirectory::Resource,
            );

            if let Ok(bundled_path) = bundled_path {
                if bundled_path.exists() {
                    let user_path = self.models_dir.join(filename);

                    // Only copy if user doesn't already have the model
                    if !user_path.exists() {
                        info!("Migrating bundled model {} to user directory", filename);
                        fs::copy(&bundled_path, &user_path)?;
                        info!("Successfully migrated {}", filename);
                    }
                }
            }
        }

        Ok(())
    }

    fn update_download_status(&self) -> Result<()> {
        let mut models = self.available_models.lock().unwrap();

        for model in models.values_mut() {
            if model.is_directory {
                // For directory-based models, check if the directory exists
                let model_path = self.models_dir.join(&model.filename);
                let partial_path = self.models_dir.join(format!("{}.partial", &model.filename));

                model.is_downloaded = if let Some(files) = &model.model_scope_files {
                    model_path.exists()
                        && model_path.is_dir()
                        && files.iter().all(|file| {
                            let f = std::path::Path::new(file)
                                .file_name()
                                .and_then(|f| f.to_str())
                                .unwrap_or(file);
                            model_path.join(f).exists()
                        })
                } else {
                    model_path.exists() && model_path.is_dir()
                };
                model.is_downloading = false;

                // Get partial file size if it exists (for the .tar.gz being downloaded)
                if partial_path.exists() {
                    model.partial_size = partial_path.metadata().map(|m| m.len()).unwrap_or(0);
                } else {
                    model.partial_size = 0;
                }
            } else {
                // For file-based models (existing logic)
                let model_path = self.models_dir.join(&model.filename);
                let partial_path = self.models_dir.join(format!("{}.partial", &model.filename));

                model.is_downloaded = model_path.exists();
                model.is_downloading = false;

                // Get partial file size if it exists
                if partial_path.exists() {
                    model.partial_size = partial_path.metadata().map(|m| m.len()).unwrap_or(0);
                } else {
                    model.partial_size = 0;
                }
            }
        }

        Ok(())
    }

    fn auto_select_model_if_needed(&self) -> Result<()> {
        let mut settings = get_settings(&self.app_handle);

        // Clear stale selection: selected model is set but doesn't exist
        // in available_models (e.g. deleted custom model file)
        if !settings.selected_model.is_empty() {
            let models = self.available_models.lock().unwrap();
            let exists = models.contains_key(&settings.selected_model);
            drop(models);

            if !exists {
                info!(
                    "Selected model '{}' not found in available models, clearing selection",
                    settings.selected_model
                );
                settings.selected_model = String::new();
                write_settings(&self.app_handle, settings.clone());
            }
        }

        // If no model is selected, pick the first downloaded one
        if settings.selected_model.is_empty() {
            // Find the first available (downloaded) model
            let models = self.available_models.lock().unwrap();
            if let Some(available_model) = models.values().find(|model| model.is_downloaded) {
                info!(
                    "Auto-selecting model: {} ({})",
                    available_model.id, available_model.name
                );

                // Update settings with the selected model
                let mut updated_settings = settings;
                updated_settings.selected_model = available_model.id.clone();
                write_settings(&self.app_handle, updated_settings);

                info!("Successfully auto-selected model: {}", available_model.id);
            }
        }

        Ok(())
    }

    pub async fn download_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if let Some(repo_id) = &model_info.model_scope_repo {
            if let Some(files) = &model_info.model_scope_files {
                return self
                    .download_model_scope_model(&model_info, repo_id, files)
                    .await;
            }
        }

        Err(anyhow::anyhow!(
            "Model {} doesn't have a ModelScope repo defined",
            model_id
        ))
    }

    async fn download_model_scope_model(
        &self,
        model_info: &ModelInfo,
        repo_id: &str,
        required_files: &[String],
    ) -> Result<()> {
        let model_id = &model_info.id;
        let model_dir = self.models_dir.join(&model_info.filename);

        if !model_dir.exists() {
            fs::create_dir_all(&model_dir)?;
        }

        let all_files_exist = required_files.iter().all(|file| {
            let f = std::path::Path::new(file)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(file);
            model_dir.join(f).exists()
        });
        if all_files_exist {
            self.update_download_status()?;
            let progress = DownloadProgress {
                model_id: model_id.to_string(),
                downloaded: 100,
                total: 100,
                percentage: 100.0,
            };
            let _ = self.app_handle.emit("model-download-progress", &progress);
            let _ = self.app_handle.emit("model-download-complete", model_id);
            return Ok(());
        }

        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = true;
            }
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.insert(model_id.to_string(), cancel_flag.clone());
        }

        let progress_by_file = Arc::new(Mutex::new(HashMap::new()));
        {
            let mut progress = progress_by_file.lock().unwrap();
            for file in required_files {
                let file_name_only = std::path::Path::new(file)
                    .file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or(file);
                let file_path = model_dir.join(file_name_only);
                if file_path.exists() {
                    progress.insert(file.to_string(), (1, 1));
                } else {
                    progress.insert(file.to_string(), (0, 1));
                }
            }
        }

        let callback = ModelScopeProgressCallback {
            app_handle: self.app_handle.clone(),
            model_id: model_id.to_string(),
            progress_by_file: progress_by_file.clone(),
        };

        let clear_downloading_state = || {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
            }
            drop(models);
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.remove(model_id);
        };

        for file_name in required_files {
            if cancel_flag.load(Ordering::Relaxed) {
                clear_downloading_state();
                return Ok(());
            }

            // Flatten files: use only the filename for local storage
            let file_name_only = std::path::Path::new(file_name)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(file_name);
            let target_file = model_dir.join(file_name_only);

            if target_file.exists() {
                continue;
            }

            let download_fut = ModelScope::download_single_file_with_callback(
                repo_id,
                file_name,
                self.models_dir.clone(),
                callback.clone(),
            );

            let cancel_flag_clone = cancel_flag.clone();
            let cancel_fut = async move {
                loop {
                    if cancel_flag_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            };

            let download_res = tokio::select! {
                res = download_fut => res,
                _ = cancel_fut => {
                    info!("Download interrupted by cancel flag for {}", file_name);
                    clear_downloading_state();
                    // Optionally clean up partial file if needed, modelscope-ng usually temp files
                    return Ok(());
                }
            };

            if let Err(e) = download_res {
                clear_downloading_state();
                return Err(anyhow::anyhow!(
                    "Failed to download ModelScope file {}: {}",
                    file_name,
                    e
                ));
            }

            let downloaded_path = self.models_dir.join(repo_id).join(file_name);
            if !downloaded_path.exists() {
                clear_downloading_state();
                return Err(anyhow::anyhow!(
                    "Downloaded ModelScope file not found: {}",
                    file_name
                ));
            }

            if target_file.exists() {
                let _ = fs::remove_file(&target_file);
            }

            if fs::rename(&downloaded_path, &target_file).is_err() {
                fs::copy(&downloaded_path, &target_file)?;
                let _ = fs::remove_file(&downloaded_path);
            }
        }

        let _ = fs::remove_dir_all(self.models_dir.join(repo_id));

        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
                model.is_downloaded = true;
                model.partial_size = 0;
            }
        }

        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.remove(model_id);
        }

        let final_progress = DownloadProgress {
            model_id: model_id.to_string(),
            downloaded: 100,
            total: 100,
            percentage: 100.0,
        };
        let _ = self
            .app_handle
            .emit("model-download-progress", &final_progress);
        let _ = self.app_handle.emit("model-download-complete", model_id);

        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        debug!("ModelManager: delete_model called for: {}", model_id);

        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        debug!("ModelManager: Found model info: {:?}", model_info);

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));
        debug!("ModelManager: Model path: {:?}", model_path);
        debug!("ModelManager: Partial path: {:?}", partial_path);

        let mut deleted_something = false;

        if model_info.is_directory {
            // Delete complete model directory if it exists
            if model_path.exists() && model_path.is_dir() {
                info!("Deleting model directory at: {:?}", model_path);
                fs::remove_dir_all(&model_path)?;
                info!("Model directory deleted successfully");
                deleted_something = true;
            }
        } else {
            // Delete complete model file if it exists
            if model_path.exists() {
                info!("Deleting model file at: {:?}", model_path);
                fs::remove_file(&model_path)?;
                info!("Model file deleted successfully");
                deleted_something = true;
            }
        }

        // Delete partial file if it exists (same for both types)
        if partial_path.exists() {
            info!("Deleting partial file at: {:?}", partial_path);
            fs::remove_file(&partial_path)?;
            info!("Partial file deleted successfully");
            deleted_something = true;
        }

        if !deleted_something {
            return Err(anyhow::anyhow!("No model files found to delete"));
        }

        // Custom models should be removed from the list entirely since they
        // have no download URL and can't be re-downloaded
        if model_info.is_custom {
            let mut models = self.available_models.lock().unwrap();
            models.remove(model_id);
            debug!("ModelManager: removed custom model from available models");
        } else {
            // Update download status (marks predefined models as not downloaded)
            self.update_download_status()?;
            debug!("ModelManager: download status updated");
        }

        // Emit event to notify UI
        let _ = self.app_handle.emit("model-deleted", model_id);

        Ok(())
    }

    pub fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not available: {}", model_id));
        }

        // Ensure we don't return partial files/directories
        if model_info.is_downloading {
            return Err(anyhow::anyhow!(
                "Model is currently downloading: {}",
                model_id
            ));
        }

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        if model_info.is_directory {
            // For directory-based models, ensure the directory exists and is complete
            if model_path.exists() && model_path.is_dir() && !partial_path.exists() {
                if let Some(files) = &model_info.model_scope_files {
                    if !files.iter().all(|file| {
                        let f = std::path::Path::new(file)
                            .file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or(file);
                        model_path.join(f).exists()
                    }) {
                        return Err(anyhow::anyhow!(
                            "Complete model files not found for {}: {:?}",
                            model_id,
                            files
                        ));
                    }
                }
                Ok(model_path)
            } else {
                Err(anyhow::anyhow!(
                    "Complete model directory not found: {}",
                    model_id
                ))
            }
        } else {
            // For file-based models (existing logic)
            if model_path.exists() && !partial_path.exists() {
                Ok(model_path)
            } else {
                Err(anyhow::anyhow!(
                    "Complete model file not found: {}",
                    model_id
                ))
            }
        }
    }

    pub fn cancel_download(&self, model_id: &str) -> Result<()> {
        debug!("ModelManager: cancel_download called for: {}", model_id);

        // Set the cancellation flag to stop the download loop
        {
            let flags = self.cancel_flags.lock().unwrap();
            if let Some(flag) = flags.get(model_id) {
                flag.store(true, Ordering::Relaxed);
                info!("Cancellation flag set for: {}", model_id);
            } else {
                warn!("No active download found for: {}", model_id);
            }
        }

        // Update state immediately for UI responsiveness
        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
            }
        }

        // Update download status to reflect current state
        self.update_download_status()?;

        // Emit cancellation event so all UI components can clear their state
        let _ = self.app_handle.emit("model-download-cancelled", model_id);

        info!("Download cancellation initiated for: {}", model_id);
        Ok(())
    }
}
