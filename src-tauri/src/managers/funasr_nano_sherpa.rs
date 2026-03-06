use anyhow::Result;
use sherpa_rs::funasr_nano::{FunASRNanoConfig, FunASRNanoRecognizer};
use std::sync::Mutex;

pub struct FunASRNanoSherpaASR {
    recognizer: Mutex<FunASRNanoRecognizer>,
}

impl FunASRNanoSherpaASR {
    pub fn new(
        encoder_adaptor: &str,
        llm: &str,
        embedding: &str,
        tokenizer: &str,
        provider: Option<String>,
        num_threads: Option<i32>,
    ) -> Result<Self> {
        let provider_str = provider.clone().unwrap_or_else(|| "cpu".to_string());
        log::info!(
            "FunASRNanoSherpaASR: initializing with encoder_adaptor={}, llm={}, embedding={}, tokenizer={}, provider={}, num_threads={:?}",
            encoder_adaptor,
            llm,
            embedding,
            tokenizer,
            provider_str,
            num_threads
        );

        let config = FunASRNanoConfig {
            encoder_adaptor: encoder_adaptor.into(),
            llm: llm.into(),
            embedding: embedding.into(),
            tokenizer: tokenizer.into(),
            language: "auto".into(),
            provider: provider.or(Some("cpu".into())),
            num_threads: Some(num_threads.unwrap_or(1)),
            debug: false,
        };

        let recognizer = match FunASRNanoRecognizer::new(config) {
            Ok(r) => {
                log::info!("FunASRNanoSherpaASR: successfully initialized recognizer");
                r
            }
            Err(e) => {
                log::error!(
                    "FunASRNanoSherpaASR: failed to initialize recognizer: {:?}",
                    e
                );
                return Err(anyhow::anyhow!(
                    "Failed to initialize FunASRNanoSherpaASR: {:?}",
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
        log::info!("FunASRNanoSherpaASR unloaded");
    }
}
