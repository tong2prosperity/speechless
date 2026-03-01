use async_trait::async_trait;
use modelscope_ng::{ModelScope, ProgressCallback};
use std::path::PathBuf;

#[derive(Clone)]
struct CustomCallback;

#[async_trait]
impl ProgressCallback for CustomCallback {
    async fn on_file_start(&self, file_name: &str, file_size: u64) {
        println!("Starting download: {} ({} bytes)", file_name, file_size);
    }

    async fn on_file_progress(&self, file_name: &str, downloaded: u64, total: u64) {
        let percent = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0) as u32
        } else {
            0
        };
        // We print a carriage return to overwrite the line
        print!(
            "\rProgress: {} - {}% ({}/{})      ",
            file_name, percent, downloaded, total
        );
        use std::io::Write;
        let _ = std::io::stdout().flush();
    }

    async fn on_file_complete(&self, file_name: &str) {
        println!("\nCompleted: {}", file_name);
    }

    async fn on_file_error(&self, file_name: &str, error: &str) {
        eprintln!("\nError downloading {}: {}", file_name, error);
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let repo_id = "trevorlink/asr-collection";
    let save_dir = PathBuf::from("./test_models");
    let callback = CustomCallback;

    // Parakeet V3 required files
    let files = vec![
        "parakeet-0.6b-v3/decoder.int8.onnx",
        "parakeet-0.6b-v3/encoder.int8.onnx",
        "parakeet-0.6b-v3/joiner.int8.onnx",
        "parakeet-0.6b-v3/tokens.txt",
    ];

    println!("Starting download of Parakeet V3 from ModelScope...");
    println!("Repo: {}", repo_id);
    println!(
        "Target Directory: {:?}",
        save_dir.canonicalize().unwrap_or(save_dir.clone())
    );

    for file in files {
        if let Err(e) = ModelScope::download_single_file_with_callback(
            repo_id,
            file,
            save_dir.clone(),
            callback.clone(),
        )
        .await
        {
            eprintln!("Failed to download {}: {}", file, e);
        }
    }

    println!("\nAll downloads processed!");

    Ok(())
}
