use crate::managers::llm_manager::LlmManager;
use std::sync::Arc;
use tauri::State;

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
