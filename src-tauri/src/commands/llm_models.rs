use crate::managers::llm_manager::{LlmManager, LlmModelInfo, AVAILABLE_LLM_MODELS};
use crate::settings::{get_settings, write_settings, LocalLlmUnloadTimeout};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub async fn get_available_llm_models() -> Result<Vec<LlmModelInfo>, String> {
    Ok(AVAILABLE_LLM_MODELS.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn download_local_llm(
    llm_manager: State<'_, Arc<LlmManager>>,
    model_id: String,
) -> Result<(), String> {
    llm_manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn check_local_llm_downloaded(
    app_handle: AppHandle,
    llm_manager: State<'_, Arc<LlmManager>>,
) -> Result<bool, String> {
    let settings = get_settings(&app_handle);
    let model_id = settings
        .post_process_models
        .get("navi_llm")
        .cloned()
        .unwrap_or_else(|| "qwen3-4b".to_string());

    let model_info = AVAILABLE_LLM_MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| "Model not found".to_string())?;

    let target_path = llm_manager.get_models_dir().join(&model_info.file_name);
    Ok(target_path.exists())
}

#[tauri::command]
#[specta::specta]
pub fn set_local_llm_unload_timeout(app: AppHandle, timeout: LocalLlmUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.local_llm_unload_timeout = timeout;
    write_settings(&app, settings);
}
