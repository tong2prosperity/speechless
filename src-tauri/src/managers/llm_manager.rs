use anyhow::Result;
use async_trait::async_trait;
use log::{debug, error, info};
use modelscope_ng::{ModelScope, ProgressCallback};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

use crate::navi_llm::{LlmConfig, LlmSessionFactory};
use crate::settings::{get_settings, LocalLlmUnloadTimeout};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct LlmDownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct LlmModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo_id: String,
    pub file_name: String,
    pub size_mb: u64,
    pub is_downloaded: bool,
}

pub static AVAILABLE_LLM_MODELS: once_cell::sync::Lazy<Vec<LlmModelInfo>> =
    once_cell::sync::Lazy::new(|| {
        vec![
            LlmModelInfo {
                id: "qwen3-4b".to_string(),
                name: "Qwen3 4B".to_string(),
                description: "Powerful and efficient local LLM by Alibaba.".to_string(),
                repo_id: "unsloth/Qwen3-4B-Instruct-2507-GGUF".to_string(),
                file_name: "Qwen3-4B-Instruct-2507-Q4_1.gguf".to_string(),
                size_mb: 2600,
                is_downloaded: false,
            },
            LlmModelInfo {
                id: "liquid-lfm-2.5-1.2b".to_string(),
                name: "Liquid LFM-2.5 1.2B".to_string(),
                description: "Next-generation 1.2B parameter model by Liquid AI.".to_string(),
                repo_id: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF".to_string(),
                file_name: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf".to_string(),
                size_mb: 731,
                is_downloaded: false,
            },
        ]
    });

pub struct LlmManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    worker_tx: tokio::sync::mpsc::Sender<LlmWorkerCommand>,
    last_activity: Arc<std::sync::atomic::AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    watcher_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
}

struct CompleteRequest {
    model_path: PathBuf,
    system_prompt: Option<String>,
    user_query: String,
    responder: tokio::sync::oneshot::Sender<std::result::Result<String, String>>,
}

enum LlmWorkerCommand {
    Complete(CompleteRequest),
    Warmup(PathBuf, Option<String>),
    Unload,
    Shutdown,
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

        let (worker_tx, worker_rx) = tokio::sync::mpsc::channel(32);
        thread::spawn(move || llm_worker_loop(worker_rx));

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
            worker_tx,
            last_activity: Arc::new(std::sync::atomic::AtomicU64::new(
                SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            )),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_handle: Arc::new(Mutex::new(None)),
        };

        {
            let app_handle_cloned = app_handle.clone();
            let worker_tx = manager.worker_tx.clone();
            let last_activity = manager.last_activity.clone();
            let shutdown_signal = manager.shutdown_signal.clone();
            let handle = thread::spawn(move || {
                while !shutdown_signal.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_secs(10));
                    if shutdown_signal.load(Ordering::Relaxed) {
                        break;
                    }

                    let settings = get_settings(&app_handle_cloned);
                    let timeout_seconds = settings.local_llm_unload_timeout.to_seconds();
                    if timeout_seconds.is_none() {
                        continue;
                    }
                    if settings.local_llm_unload_timeout == LocalLlmUnloadTimeout::Never {
                        continue;
                    }

                    let last = last_activity.load(Ordering::Relaxed);
                    let now_ms = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let timeout_ms = timeout_seconds.unwrap_or(0).saturating_mul(1000);
                    if timeout_ms > 0 && now_ms.saturating_sub(last) > timeout_ms {
                        debug!("Unloading local LLM session due to inactivity");
                        let _ = worker_tx.blocking_send(LlmWorkerCommand::Unload);
                        last_activity.store(now_ms, Ordering::Relaxed);
                    }
                }
            });
            *manager.watcher_handle.lock().unwrap() = Some(handle);
        }

        Ok(manager)
    }

    pub fn get_models_dir(&self) -> PathBuf {
        self.models_dir.clone()
    }

    pub async fn download_model(&self, target_model_id: &str) -> Result<()> {
        let model_info = AVAILABLE_LLM_MODELS
            .iter()
            .find(|m| m.id == target_model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", target_model_id))?;

        let repo_id = &model_info.repo_id;
        let file_name = &model_info.file_name;

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
        let download_fut = ModelScope::download_single_file_with_callback(
            repo_id,
            file_name,
            self.models_dir.clone(),
            callback,
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

        let res = tokio::select! {
            r = download_fut => r,
            _ = cancel_fut => {
                info!("Download interrupted by cancel flag for {}", file_name);
                let mut flags = self.cancel_flags.lock().unwrap();
                flags.remove(target_model_id);
                return Ok(());
            }
        };

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
                let mut flags = self.cancel_flags.lock().unwrap();
                flags.remove(target_model_id);
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

    pub fn cancel_download(&self, target_model_id: &str) -> anyhow::Result<()> {
        let flags = self.cancel_flags.lock().unwrap();
        if let Some(flag) = flags.get(target_model_id) {
            flag.store(true, Ordering::Relaxed);
            info!("Cancellation flag set for LLM: {}", target_model_id);
        }
        let _ = self
            .app_handle
            .emit("llm-download-cancelled", target_model_id);
        Ok(())
    }

    pub fn delete_model(&self, target_model_id: &str) -> anyhow::Result<()> {
        let model_info = AVAILABLE_LLM_MODELS
            .iter()
            .find(|m| m.id == target_model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", target_model_id))?;

        let target_path = self.models_dir.join(&model_info.file_name);
        if target_path.exists() {
            std::fs::remove_file(&target_path)?;
            info!("Deleted LLM model: {}", target_model_id);
        }

        let _ = self.app_handle.emit("llm-model-deleted", target_model_id);
        Ok(())
    }

    pub async fn complete_with_session(
        &self,
        model_path: PathBuf,
        system_prompt: Option<String>,
        user_query: String,
    ) -> Result<String> {
        self.touch_activity();
        let (responder, rx) = tokio::sync::oneshot::channel();
        self.worker_tx
            .send(LlmWorkerCommand::Complete(CompleteRequest {
                model_path,
                system_prompt,
                user_query,
                responder,
            }))
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send command to LLM worker: {}", e))?;

        match rx.await {
            Ok(Ok(s)) => {
                self.touch_activity();
                Ok(s)
            }
            Ok(Err(e)) => Err(anyhow::anyhow!(e)),
            Err(e) => Err(anyhow::anyhow!("LLM worker channel closed: {}", e)),
        }
    }

    fn touch_activity(&self) {
        let now_ms = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.last_activity.store(now_ms, Ordering::Relaxed);
    }

    pub async fn warmup(&self, model_path: PathBuf, system_prompt: Option<String>) -> Result<()> {
        self.worker_tx
            .send(LlmWorkerCommand::Warmup(model_path, system_prompt))
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send warmup command: {}", e))
    }

    pub async fn unload(&self) -> Result<()> {
        self.worker_tx
            .send(LlmWorkerCommand::Unload)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send unload command: {}", e))
    }
}

fn llm_worker_loop(mut rx: tokio::sync::mpsc::Receiver<LlmWorkerCommand>) {
    let mut pending_cmd: Option<LlmWorkerCommand> = None;

    loop {
        let initial_cmd = if let Some(cmd) = pending_cmd.take() {
            cmd
        } else {
            loop {
                let cmd = match rx.blocking_recv() {
                    Some(cmd) => cmd,
                    None => return,
                };
                match cmd {
                    LlmWorkerCommand::Complete(req) => break LlmWorkerCommand::Complete(req),
                    LlmWorkerCommand::Warmup(path, sp) => break LlmWorkerCommand::Warmup(path, sp),
                    LlmWorkerCommand::Unload => {}
                    LlmWorkerCommand::Shutdown => return,
                }
            }
        };

        let (model_path, system_prompt) = match &initial_cmd {
            LlmWorkerCommand::Complete(req) => (req.model_path.clone(), req.system_prompt.clone()),
            LlmWorkerCommand::Warmup(path, sp) => (path.clone(), sp.clone()),
            _ => unreachable!(),
        };

        log::info!("[llm_worker] Loading local LLM from: {:?}", model_path);
        let mut config = LlmConfig::new(model_path);
        if let Some(ref sp) = system_prompt {
            if !sp.is_empty() {
                config = config.with_system_prompt(sp);
            }
        }

        let active_model_path = config.model_path.clone();
        let active_system_prompt = config.system_prompt.clone();
        match LlmSessionFactory::new(config) {
            Ok(factory) => match factory.create_session() {
                Ok(mut session) => {
                    log::info!("[llm_worker] Session created");
                    if let LlmWorkerCommand::Complete(req) = initial_cmd {
                        let res = session.chat(&req.user_query).map_err(|e| e.to_string());
                        let _ = req.responder.send(res);
                    }

                    loop {
                        let cmd = match rx.blocking_recv() {
                            Some(cmd) => cmd,
                            None => return,
                        };

                        match cmd {
                            LlmWorkerCommand::Complete(req) => {
                                if req.model_path != active_model_path
                                    || req.system_prompt != active_system_prompt
                                {
                                    log::info!("[llm_worker] Config changed, recreating session");
                                    pending_cmd = Some(LlmWorkerCommand::Complete(req));
                                    break;
                                }

                                log::info!("[llm_worker] Reusing KV cache");
                                session.clear();
                                let res = session.chat(&req.user_query).map_err(|e| e.to_string());
                                let _ = req.responder.send(res);
                            }
                            LlmWorkerCommand::Warmup(model_path, system_prompt) => {
                                if model_path != active_model_path
                                    || system_prompt != active_system_prompt
                                {
                                    log::info!(
                                        "[llm_worker] Warmup config changed, recreating session"
                                    );
                                    pending_cmd =
                                        Some(LlmWorkerCommand::Warmup(model_path, system_prompt));
                                    break;
                                }
                                log::info!("[llm_worker] Already warmed up with same config");
                            }
                            LlmWorkerCommand::Unload => {
                                log::info!("[llm_worker] Unloading local LLM session");
                                break;
                            }
                            LlmWorkerCommand::Shutdown => return,
                        }
                    }
                }
                Err(e) => {
                    if let LlmWorkerCommand::Complete(req) = initial_cmd {
                        let _ = req.responder.send(Err(e.to_string()));
                    }
                }
            },
            Err(e) => {
                if let LlmWorkerCommand::Complete(req) = initial_cmd {
                    let _ = req.responder.send(Err(e.to_string()));
                }
            }
        }
    }
}

impl Drop for LlmManager {
    fn drop(&mut self) {
        self.shutdown_signal.store(true, Ordering::Relaxed);
        let _ = self.worker_tx.try_send(LlmWorkerCommand::Shutdown);
        if let Some(handle) = self.watcher_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
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
