use anyhow::Result;
use sherpa_rs::transducer::{TransducerConfig, TransducerRecognizer};
use std::sync::Mutex;

pub struct ParakeetSherpaASR {
    recognizer: Mutex<TransducerRecognizer>,
}

impl ParakeetSherpaASR {
    pub fn new(
        encoder: &str,
        decoder: &str,
        joiner: &str,
        tokens: &str,
        provider: Option<String>,
        num_threads: Option<i32>,
    ) -> Result<Self> {
        log::info!(
            "ParakeetSherpaASR: initializing with encoder={}, decoder={}, joiner={}, tokens={}, provider={:?}, num_threads={:?}",
            encoder,
            decoder,
            joiner,
            tokens,
            provider,
            num_threads
        );

        let config = TransducerConfig {
            encoder: encoder.to_string(),
            decoder: decoder.to_string(),
            joiner: joiner.to_string(),
            tokens: tokens.to_string(),
            provider,
            num_threads: num_threads.unwrap_or(1),
            sample_rate: 16_000,
            feature_dim: 80,
            debug: false,
            model_type: "nemo_transducer".to_string(),
            ..Default::default()
        };

        let recognizer = match TransducerRecognizer::new(config) {
            Ok(r) => {
                log::info!("ParakeetSherpaASR: successfully initialized recognizer");
                r
            }
            Err(e) => {
                log::error!(
                    "ParakeetSherpaASR: failed to initialize recognizer: {:?}",
                    e
                );
                return Err(anyhow::anyhow!(
                    "Failed to initialize ParakeetSherpaASR: {:?}",
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
        Ok(result.to_lowercase().trim().to_string())
    }

    pub fn unload_model(&mut self) {
        log::info!("ParakeetSherpaASR unloaded");
    }
}
