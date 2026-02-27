use anyhow::Result;
use sherpa_rs::sense_voice::SenseVoiceConfig;
use sherpa_rs::sense_voice::SenseVoiceRecognizer;
use std::sync::Mutex;

pub struct SenseVoiceSherpaASR {
    recognizer: Mutex<SenseVoiceRecognizer>,
}

impl SenseVoiceSherpaASR {
    pub fn new(
        model_path: &str,
        tokens_path: &str,
        provider: Option<String>,
        num_threads: Option<i32>,
    ) -> Result<Self> {
        let provider_str = provider.clone().unwrap_or_else(|| "cpu".to_string());
        log::info!(
            "SenseVoiceSherpaASR: initializing with model={}, tokens={}, provider={}, num_threads={:?}",
            model_path,
            tokens_path,
            provider_str,
            num_threads
        );

        let config = SenseVoiceConfig {
            model: model_path.into(),
            tokens: tokens_path.into(),
            provider: provider.or(Some("cpu".into())),
            num_threads: Some(num_threads.unwrap_or(1)),
            debug: false,
            ..Default::default()
        };

        let recognizer = match SenseVoiceRecognizer::new(config) {
            Ok(r) => {
                log::info!("SenseVoiceSherpaASR: successfully initialized recognizer");
                r
            }
            Err(e) => {
                log::error!(
                    "SenseVoiceSherpaASR: failed to initialize recognizer: {:?}",
                    e
                );
                return Err(anyhow::anyhow!(
                    "Failed to initialize SenseVoiceSherpaASR: {:?}",
                    e
                ));
            }
        };

        Ok(Self {
            recognizer: Mutex::new(recognizer),
        })
    }

    pub fn transcribe(&self, sample_rate: u32, samples: &[f32]) -> Result<String> {
        let mut recognizer = self
            .recognizer
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock recognizer: {}", e))?;
        let result = recognizer.transcribe(sample_rate, samples);
        Ok(result.text)
    }

    pub fn unload_model(&mut self) {
        log::info!("SenseVoiceSherpaASR unloaded");
        // Handled securely by Drop of Mutex/recognizer
    }
}
