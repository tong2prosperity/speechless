use anyhow::Result;
use ndarray::{Array, Array2, ArrayBase, ArrayD, Dim, IxDynImpl, OwnedRepr};
use ort::execution_providers::CoreMLExecutionProvider;
use ort::session::{Session, SessionInputs};
use ort::value::Value;
use std::path::Path;

use crate::audio_toolkit::constants;

/// Frame duration in milliseconds for Silero VAD v6.
pub const SILERO_FRAME_MS: u32 = 32;
/// Number of samples per frame at 16 kHz.
pub const SILERO_FRAME_SAMPLES: usize =
    (constants::WHISPER_SAMPLE_RATE * SILERO_FRAME_MS / 1000) as usize; // 512

pub struct Silero {
    session: Session,
    sample_rate: ArrayBase<OwnedRepr<i64>, Dim<[usize; 1]>>,
    state: ArrayBase<OwnedRepr<f32>, Dim<IxDynImpl>>,
    context: ndarray::Array1<f32>,
    context_size: usize,
}

impl Silero {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let model_path = model_path.as_ref();
        log::info!("Silero VAD v6: initializing from {:?}", model_path);

        #[cfg(target_os = "macos")]
        let session = {
            let providers = vec![CoreMLExecutionProvider::default()
                .with_subgraphs(true)
                .build()];
            Session::builder()?
                .with_execution_providers(providers)?
                .commit_from_file(model_path)?
        };
        #[cfg(not(target_os = "macos"))]
        let session = { Session::builder()?.commit_from_file(model_path)? };

        const BATCH: usize = 1;
        let state = ArrayD::<f32>::zeros([2, BATCH, 128].as_slice());
        let sample_rate_val: i64 = constants::WHISPER_SAMPLE_RATE as i64;
        let context_size: usize = 64; // 16 kHz → 64
        let context = ndarray::Array1::<f32>::zeros(context_size);
        let sample_rate = Array::from_shape_vec([1], vec![sample_rate_val]).unwrap();

        Ok(Self {
            session,
            sample_rate,
            state,
            context,
            context_size,
        })
    }

    pub fn reset(&mut self) {
        self.state = ArrayD::<f32>::zeros([2, 1, 128].as_slice());
        self.context = ndarray::Array1::<f32>::zeros(self.context_size);
    }

    /// Run inference on a single audio frame and return the speech probability.
    pub fn calc_level_f32(&mut self, audio_frame: &[f32]) -> Result<f32> {
        let mut input_with_context = Vec::with_capacity(self.context_size + audio_frame.len());
        input_with_context.extend_from_slice(self.context.as_slice().unwrap());
        input_with_context.extend_from_slice(audio_frame);

        let frame =
            Array2::<f32>::from_shape_vec([1, input_with_context.len()], input_with_context)
                .unwrap();

        let inps = ort::inputs![
            Value::from_array(frame)?,
            Value::from_array(std::mem::take(&mut self.state))?,
            Value::from_array(self.sample_rate.clone())?,
        ];

        let res = self.session.run(SessionInputs::ValueSlice::<3>(&inps))?;

        let state_view: ndarray::ArrayViewD<f32> = res["stateN"].try_extract_array()?;
        self.state = state_view.to_owned();

        if audio_frame.len() >= self.context_size {
            self.context = ndarray::Array1::from_vec(
                audio_frame[audio_frame.len() - self.context_size..].to_vec(),
            );
        }

        let out_view: ndarray::ArrayViewD<f32> = res["output"].try_extract_array()?;
        Ok(*out_view.first().unwrap())
    }
}
