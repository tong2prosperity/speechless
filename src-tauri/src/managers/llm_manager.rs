use anyhow::Result;
use async_trait::async_trait;
use log::{debug, error, info};
use modelscope_ng::{ModelScope, ProgressCallback};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct LlmDownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

pub struct LlmManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl LlmManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?
            .join("models")
            .join("llm");

        if !models_dir.exists() {
            std::fs::create_dir_all(&models_dir)?;
        }

        Ok(Self {
            app_handle: app_handle.clone(),
            models_dir,
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn get_models_dir(&self) -> PathBuf {
        self.models_dir.clone()
    }

    pub async fn download_model(
        &self,
        repo_id: &str,
        file_name: &str,
        target_model_id: &str,
    ) -> Result<()> {
        let target_path = self.models_dir.join(file_name);
        if target_path.exists() {
            info!(
                "Model {} already exists at {:?}",
                target_model_id, target_path
            );
            let progress = LlmDownloadProgress {
                model_id: target_model_id.to_string(),
                downloaded: 100,
                total: 100,
                percentage: 100.0,
            };
            let _ = self.app_handle.emit("model-download-progress", &progress);
            let _ = self
                .app_handle
                .emit("model-download-complete", target_model_id);
            return Ok(());
        }

        info!(
            "Downloading local LLM {} from {}/{}",
            target_model_id, repo_id, file_name
        );

        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.insert(target_model_id.to_string(), cancel_flag.clone());
        }

        let callback = LlmProgressCallback {
            app_handle: self.app_handle.clone(),
            model_id: target_model_id.to_string(),
            cancel_flag: cancel_flag.clone(),
        };

        // Download directly to our target directory so the final file is models_dir/model_id
        let res = ModelScope::download_single_file_with_callback(
            repo_id,
            file_name,
            self.models_dir.clone(),
            callback,
        )
        .await;

        match res {
            Ok(_) => {
                // modelscope-ng puts the file in `<save_dir>/<model_id>/<file_name>`
                // let's move it out to target_path because we requested target_path
                let downloaded_path = self.models_dir.join(repo_id).join(file_name);
                if downloaded_path.exists() {
                    let _ = std::fs::rename(downloaded_path, target_path);
                    let _ = std::fs::remove_dir_all(self.models_dir.join(repo_id));
                    // Clean empty folder if possible
                }

                info!("Finished downloading LLM to {:?}", self.models_dir);
            }
            Err(e) => {
                error!("Failed to download LLM: {}", e);
                return Err(anyhow::anyhow!("Download failed: {}", e));
            }
        }

        // Cleanup cancel flag
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.remove(target_model_id);
        }

        Ok(())
    }
}

#[derive(Clone)]
struct LlmProgressCallback {
    app_handle: AppHandle,
    model_id: String,
    cancel_flag: Arc<AtomicBool>,
}

#[async_trait]
impl ProgressCallback for LlmProgressCallback {
    async fn on_file_start(&self, _file_name: &str, _file_size: u64) {}

    async fn on_file_progress(&self, _file_name: &str, downloaded: u64, total: u64) {
        if self.cancel_flag.load(Ordering::Relaxed) {
            // modelscope-ng v0.2.0 doesn't natively expose cancellation in callbacks
            // A panic or returning an error would be needed if supported,
            // but we'll just log for now based on its API.
            info!("LLM Download cancelled for: {}", self.model_id);
        }

        let percentage = if total > 0 {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        let progress = LlmDownloadProgress {
            model_id: self.model_id.clone(),
            downloaded,
            total,
            percentage,
        };

        let _ = self.app_handle.emit("model-download-progress", &progress);
    }

    async fn on_file_complete(&self, _file_name: &str) {
        let _ = self
            .app_handle
            .emit("model-download-complete", &self.model_id);
    }

    async fn on_file_error(&self, _file_name: &str, error: &str) {
        error!("LLM Download failed for {}: {}", self.model_id, error);
    }
}
