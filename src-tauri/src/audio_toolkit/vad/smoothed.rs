use super::silero::{Silero, SILERO_FRAME_SAMPLES};
use super::{VadFrame, VoiceActivityDetector};
use anyhow::Result;
use std::collections::VecDeque;
use std::path::Path;

// ── Speech state machine (ported from navi-audio) ──────────────────────────

#[derive(Debug, Copy, Clone, PartialEq)]
enum SpeechState {
    Silent,
    StartSpeaking,
    Speaking,
    TempSilence,
    StopSpeaking,
}

struct StreamState {
    speech_state: SpeechState,
    speech_cnt: u32,
    temp_silence_cnt: u32,
    silence_threshold_cnt: u32,
    pre_speech_threshold_cnt: u32,
    speech_threshold_cnt: u32,
    speech_threshold: f32,
    low_prob_threshold: f32,
    max_speech_cnt: u32,
}

impl StreamState {
    fn new(config: &VadConfig) -> Self {
        let speech_threshold = config.threshold.max(0.3);
        Self {
            speech_state: SpeechState::Silent,
            speech_cnt: 0,
            temp_silence_cnt: 0,
            silence_threshold_cnt: (config.silence_stop_ms / 32) as u32,
            pre_speech_threshold_cnt: config.pre_speech_threshold_frame_cnt as u32,
            speech_threshold_cnt: config.speech_threshold_frame_cnt as u32,
            speech_threshold,
            low_prob_threshold: speech_threshold - 0.15,
            max_speech_cnt: u32::MAX,
        }
    }

    fn reset(&mut self) {
        self.speech_state = SpeechState::Silent;
        self.speech_cnt = 0;
        self.temp_silence_cnt = 0;
    }

    fn finish_round(&mut self, record: bool) {
        self.speech_state = if record {
            SpeechState::StopSpeaking
        } else {
            SpeechState::Silent
        };
        self.temp_silence_cnt = 0;
        self.speech_cnt = 0;
    }

    fn update(&mut self, speech_prob: f32) -> SpeechState {
        let is_speech = speech_prob > self.speech_threshold;
        let is_low_prob = speech_prob > self.low_prob_threshold;

        match self.speech_state {
            SpeechState::Silent => {
                if is_speech {
                    self.speech_cnt += 1;
                    if self.speech_cnt >= self.pre_speech_threshold_cnt {
                        self.speech_state = SpeechState::StartSpeaking;
                    }
                } else {
                    self.speech_cnt = 0;
                }
            }

            SpeechState::StartSpeaking => {
                if is_low_prob {
                    self.speech_cnt += 1;
                    if self.speech_cnt
                        >= self.speech_threshold_cnt + self.pre_speech_threshold_cnt
                    {
                        self.speech_state = SpeechState::Speaking;
                    }
                } else {
                    self.finish_round(false);
                }
            }

            SpeechState::Speaking => {
                if is_low_prob {
                    self.speech_cnt += 1;
                    if self.speech_cnt > self.max_speech_cnt {
                        self.finish_round(true);
                    }
                } else {
                    self.speech_state = SpeechState::TempSilence;
                    self.temp_silence_cnt += 1;
                }
            }

            SpeechState::TempSilence => {
                if is_low_prob {
                    self.speech_state = SpeechState::Speaking;
                    self.speech_cnt += 1;
                    self.temp_silence_cnt = 0;
                } else {
                    self.temp_silence_cnt += 1;
                    if self.temp_silence_cnt >= self.silence_threshold_cnt {
                        self.finish_round(true);
                    }
                }
            }

            SpeechState::StopSpeaking => {
                self.speech_state = SpeechState::Silent;
                if is_speech {
                    self.speech_cnt += 1;
                }
            }
        }

        self.speech_state
    }
}

// ── Configuration ──────────────────────────────────────────────────────────

pub struct VadConfig {
    pub threshold: f32,
    pub prefill_frames: usize,
    pub silence_stop_ms: usize,
    pub pre_speech_threshold_frame_cnt: usize,
    pub speech_threshold_frame_cnt: usize,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            threshold: 0.3,
            prefill_frames: 15,
            silence_stop_ms: 1200,
            pre_speech_threshold_frame_cnt: 1,
            speech_threshold_frame_cnt: 1,
        }
    }
}

// ── SileroVad: Silero v6 + StreamState + prefill ───────────────────────────

pub struct SileroVad {
    silero: Silero,
    stream_state: StreamState,
    config: VadConfig,

    // prefill ring buffer
    frame_buffer: VecDeque<Vec<f32>>,
    in_speech: bool,
    temp_out: Vec<f32>,
}

impl SileroVad {
    pub fn new<P: AsRef<Path>>(model_path: P, config: VadConfig) -> Result<Self> {
        let silero = Silero::new(model_path)?;
        let stream_state = StreamState::new(&config);
        Ok(Self {
            silero,
            stream_state,
            config,
            frame_buffer: VecDeque::new(),
            in_speech: false,
            temp_out: Vec::new(),
        })
    }
}

impl VoiceActivityDetector for SileroVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>> {
        if frame.len() != SILERO_FRAME_SAMPLES {
            anyhow::bail!(
                "expected {} samples, got {}",
                SILERO_FRAME_SAMPLES,
                frame.len()
            );
        }

        // Buffer every frame for prefill
        self.frame_buffer.push_back(frame.to_vec());
        while self.frame_buffer.len() > self.config.prefill_frames + 1 {
            self.frame_buffer.pop_front();
        }

        // Run Silero inference
        let speech_prob = self.silero.calc_level_f32(frame)?;
        let prev_in_speech = self.in_speech;
        let state = self.stream_state.update(speech_prob);

        // Map 5-state machine to speech/noise decision
        let is_speech_now = matches!(
            state,
            SpeechState::StartSpeaking | SpeechState::Speaking | SpeechState::TempSilence
        );

        self.in_speech = is_speech_now;

        match (prev_in_speech, is_speech_now) {
            // Speech just started → return prefill buffer + current frame
            (false, true) => {
                self.temp_out.clear();
                for buf in &self.frame_buffer {
                    self.temp_out.extend(buf);
                }
                Ok(VadFrame::Speech(&self.temp_out))
            }
            // Ongoing speech (including TempSilence)
            (true, true) => Ok(VadFrame::Speech(frame)),
            // Speech just ended or still silent
            _ => Ok(VadFrame::Noise),
        }
    }

    fn reset(&mut self) {
        self.silero.reset();
        self.stream_state.reset();
        self.frame_buffer.clear();
        self.in_speech = false;
        self.temp_out.clear();
    }
}
