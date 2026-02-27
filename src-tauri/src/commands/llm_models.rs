use crate::managers::llm_manager::LlmManager;
use crate::settings::{get_settings, write_settings, LocalLlmUnloadTimeout};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub async fn download_local_llm(
    llm_manager: State<'_, Arc<LlmManager>>,
    model_id: String,
) -> Result<(), String> {
    // We hardcode the unsloth model for now as requested.
    let repo_id = "unsloth/Qwen3-4B-Instruct-2507-GGUF";
    let file_name = "Qwen3-4B-Instruct-2507-Q4_1.gguf";

    llm_manager
        .download_model(repo_id, file_name, &model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn check_local_llm_downloaded(
    llm_manager: State<'_, Arc<LlmManager>>,
) -> Result<bool, String> {
    // We hardcode the unsloth model for now as requested.
    let file_name = "Qwen3-4B-Instruct-2507-Q4_1.gguf";
    let target_path = llm_manager.get_models_dir().join(file_name);
    Ok(target_path.exists())
}

#[tauri::command]
#[specta::specta]
pub fn set_local_llm_unload_timeout(app: AppHandle, timeout: LocalLlmUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.local_llm_unload_timeout = timeout;
    write_settings(&app, settings);
}
