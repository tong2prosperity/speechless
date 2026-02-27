//! LLM 会话模块
//!
//! `LlmSessionFactory` 加载模型，`ManagedSession` 管理单次对话上下文。
//! 使用增量编码方案，复用 KV Cache，避免重复 prefilling。

use anyhow::{Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::context::LlamaContext;

use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::model::{LlamaChatMessage, LlamaChatTemplate};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::LlamaToken;
use llama_cpp_2::{send_logs_to_tracing, LogOptions};

use super::config::LlmConfig;

/// 对话消息角色
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Role {
    System,
    User,
    Assistant,
}

impl Role {
    fn as_str(&self) -> &'static str {
        match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

/// 对话消息
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: content.into(),
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: content.into(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: content.into(),
        }
    }
}

/// LLM 会话统计信息
#[derive(Debug, Clone, Default)]
pub struct SessionStats {
    /// 当前上下文中已使用的 token 数
    pub tokens_used: i32,
    /// 上下文总容量
    pub ctx_size: u32,
    /// 对话轮次数
    pub turn_count: usize,
    /// 总生成 token 数
    pub total_generated: usize,
    /// 总 prefill token 数（衡量复用效率）
    pub total_prefilled: usize,
    /// 缓存命中的 token 数
    pub cache_hits: usize,
}

/// 会话工厂 - 用于创建和管理会话
///
/// 持有模型和后端，可以创建多个独立的会话。
pub struct LlmSessionFactory {
    backend: LlamaBackend,
    model: LlamaModel,
    config: LlmConfig,
    chat_template: Option<LlamaChatTemplate>,
}

impl LlmSessionFactory {
    /// 创建会话工厂
    pub fn new(config: LlmConfig) -> Result<Self> {
        send_logs_to_tracing(LogOptions::default().with_logs_enabled(config.verbose));

        tracing::info!("正在加载本地 LLM 模型 (Factory): {:?}", config.model_path);
        let start = std::time::Instant::now();

        let backend = LlamaBackend::init().context("无法初始化 llama 后端")?;
        let model_params = LlamaModelParams::default();
        let model = LlamaModel::load_from_file(&backend, &config.model_path, &model_params)
            .with_context(|| format!("无法加载模型: {:?}", config.model_path))?;

        let duration = start.elapsed();
        tracing::info!("本地 LLM 模型加载成功，耗时: {:?}", duration);

        let chat_template = model.chat_template(None).ok();

        Ok(Self {
            backend,
            model,
            config,
            chat_template,
        })
    }

    /// 创建新的独立会话
    pub fn create_session(&self) -> Result<ManagedSession<'_>> {
        ManagedSession::new(
            &self.backend,
            &self.model,
            self.config.clone(),
            self.chat_template.clone(),
        )
    }

    /// 创建带自定义选项的独立会话
    ///
    /// 允许覆盖 ctx_size 和 max_tokens
    pub fn create_session_with_options(
        &self,
        ctx_size: Option<u32>,
        max_tokens: Option<u32>,
    ) -> Result<ManagedSession<'_>> {
        let mut config = self.config.clone();
        if let Some(s) = ctx_size {
            if let Some(nz) = std::num::NonZeroU32::new(s) {
                config.ctx_size = nz;
            }
        }
        if let Some(t) = max_tokens {
            config.max_tokens = t;
        }

        ManagedSession::new(
            &self.backend,
            &self.model,
            config,
            self.chat_template.clone(),
        )
    }

    /// 获取模型信息
    pub fn model_info(&self) -> String {
        format!(
            "模型: {:?}, ctx_size: {}",
            self.config.model_path.file_name().unwrap_or_default(),
            self.config.ctx_size
        )
    }

    /// 获取配置
    pub fn config(&self) -> &LlmConfig {
        &self.config
    }
}

/// 托管会话 - 管理单次对话的完整上下文
///
/// 使用增量编码方案：
/// - 首轮对话：编码完整 prompt，缓存到 KV Cache
/// - 后续轮次：只编码新增的 tokens，复用已有的 KV Cache
/// - 生成的 tokens 也会被缓存，供下一轮使用
pub struct ManagedSession<'a> {
    ctx: LlamaContext<'a>,
    model: &'a LlamaModel,
    config: LlmConfig,
    chat_template: Option<LlamaChatTemplate>,
    /// 对话历史（用于构建完整 prompt）
    messages: Vec<ChatMessage>,
    /// 当前 KV Cache 中已编码的 token 数（即 n_past）
    n_past: i32,
    /// 已编码的 tokens 列表（用于增量对比）
    encoded_tokens: Vec<LlamaToken>,
    /// 采样器
    sampler: LlamaSampler,
    /// 统计信息
    stats: SessionStats,
}

impl<'a> ManagedSession<'a> {
    fn new(
        backend: &LlamaBackend,
        model: &'a LlamaModel,
        config: LlmConfig,
        chat_template: Option<LlamaChatTemplate>,
    ) -> Result<Self> {
        let mut ctx_params = LlamaContextParams::default().with_n_ctx(Some(config.ctx_size));

        if let Some(threads) = config.n_threads {
            ctx_params = ctx_params.with_n_threads(threads);
        }
        if let Some(threads_batch) = config.n_threads_batch {
            ctx_params = ctx_params.with_n_threads_batch(threads_batch);
        }

        tracing::debug!("正在创建新的 LLM 上下文 (ctx_size={})", config.ctx_size);
        let ctx = model
            .new_context(backend, ctx_params)
            .context("无法创建 llama 上下文")?;
        tracing::debug!("LLM 上下文创建成功");

        let ctx_size = ctx.n_ctx();

        // Sampler: 使用 dist 采样器
        // 注意: Grammar 在当前 llama-cpp-2 版本中有兼容性问题，暂不使用
        let _ = config.grammar.as_ref(); // 避免 unused 警告
        let sampler = LlamaSampler::dist(config.seed);

        let mut messages = Vec::new();
        if let Some(ref system_prompt) = config.system_prompt {
            messages.push(ChatMessage::system(system_prompt.clone()));
        }

        Ok(Self {
            ctx,
            model,
            config,
            chat_template,
            messages,
            n_past: 0,
            encoded_tokens: Vec::new(),
            sampler,
            stats: SessionStats {
                tokens_used: 0,
                ctx_size,
                turn_count: 0,
                total_generated: 0,
                total_prefilled: 0,
                cache_hits: 0,
            },
        })
    }

    /// 发送用户消息并获取回复（非流式）
    pub fn chat(&mut self, query: &str) -> Result<String> {
        self.chat_impl(query, None::<fn(&str)>)
    }

    /// 发送用户消息并获取回复（流式）
    pub fn chat_streaming<F>(&mut self, query: &str, callback: F) -> Result<String>
    where
        F: FnMut(&str),
    {
        self.chat_impl(query, Some(callback))
    }

    /// 内部实现：处理对话（增量编码）
    fn chat_impl<F>(&mut self, query: &str, mut callback: Option<F>) -> Result<String>
    where
        F: FnMut(&str),
    {
        let start_time = std::time::Instant::now();
        // 1. 添加用户消息到历史
        tracing::info!("收到本地 LLM 查询: {}", query);
        self.messages.push(ChatMessage::user(query));

        // 2. 构建完整 prompt 并分词
        let prompt = self.build_prompt()?;
        let new_tokens = self
            .model
            .str_to_token(&prompt, llama_cpp_2::model::AddBos::Never)
            .context("分词失败")?;

        // 3. 计算增量：找出需要新编码的 tokens
        // 比较新 tokens 和已编码的 tokens，找出公共前缀长度
        let common_prefix_len = self.find_common_prefix(&new_tokens);

        tracing::debug!(
            "增量编码: new_tokens={}, encoded_tokens={}, common_prefix={}",
            new_tokens.len(),
            self.encoded_tokens.len(),
            common_prefix_len
        );

        // 如果公共前缀小于已编码的长度，说明有冲突
        // 需要从公共前缀处重新开始
        if common_prefix_len < self.encoded_tokens.len() {
            tracing::warn!("检测到 token 冲突，从位置 {} 重新编码", common_prefix_len);
            self.n_past = common_prefix_len as i32;
            self.encoded_tokens.truncate(common_prefix_len);
        }

        // 需要编码的新 tokens
        let tokens_to_encode: Vec<LlamaToken> = if self.encoded_tokens.len() < new_tokens.len() {
            new_tokens[self.encoded_tokens.len()..].to_vec()
        } else {
            // 如果已编码的 tokens 反而更多或相等，这是异常情况
            // 强制编码最后一个新 token 以获取 logits
            tracing::warn!(
                "异常状态: encoded_tokens({}) >= new_tokens({}), 强制编码",
                self.encoded_tokens.len(),
                new_tokens.len()
            );
            if let Some(&last) = new_tokens.last() {
                vec![last]
            } else {
                anyhow::bail!("无法生成：prompt 为空");
            }
        };

        // 4. 检查上下文容量
        let required_ctx = new_tokens.len() as i32 + self.config.max_tokens as i32;
        let n_ctx = self.ctx.n_ctx() as i32;
        if required_ctx > n_ctx {
            anyhow::bail!(
                "上下文容量不足: 需要 {} tokens，但只有 {} tokens 可用。考虑调用 clear() 清理历史。",
                required_ctx,
                n_ctx
            );
        }

        // 5. 编码新增的 tokens（增量 prefill） - 分批处理
        let mut batch = LlamaBatch::new(512, 1);
        if !tokens_to_encode.is_empty() {
            let batch_size = 512;
            for chunk in tokens_to_encode.chunks(batch_size) {
                batch.clear();
                let chunk_len = chunk.len();

                for (i, token) in chunk.iter().enumerate() {
                    let pos = self.n_past + i as i32;
                    let current_global_pos = self.n_past + i as i32;
                    let target_last_pos =
                        (self.encoded_tokens.len() + tokens_to_encode.len()) as i32 - 1;
                    let is_last_in_sequence = current_global_pos == target_last_pos;

                    batch.add(*token, pos, &[0], is_last_in_sequence)?;
                }

                self.ctx.decode(&mut batch).context("增量 prefill 失败")?;
                self.n_past += chunk_len as i32;
            }

            self.encoded_tokens.extend(tokens_to_encode.iter().cloned());
            self.stats.total_prefilled += tokens_to_encode.len();
        } else {
            // 如果没有新增 tokens，需要重新编码最后一个 token 来获取 logits
            // 这种情况理论上不应该发生（每轮至少会有新的 user 消息）
            // 但为安全起见，重新 decode 最后一个 token
            if let Some(&last_token) = self.encoded_tokens.last() {
                let last_pos = self.n_past - 1;
                batch.add(last_token, last_pos, &[0], true)?;
                self.ctx
                    .decode(&mut batch)
                    .context("重新编码最后 token 失败")?;
            } else {
                anyhow::bail!("会话状态异常：没有已编码的 tokens");
            }
        }

        // 记录缓存命中
        self.stats.cache_hits += common_prefix_len;

        // 6. 生成回复
        let mut output = String::new();
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let max_tokens = self.config.max_tokens as i32;
        let n_len = self.n_past + max_tokens;

        // 采样索引：decode 后 logits 在 batch 的最后一个 token 位置
        // batch.n_tokens() - 1 就是正确的索引（此时 batch 一定非空）
        let mut logit_idx = batch.n_tokens() - 1;

        while self.n_past < n_len {
            // 采样
            let token = self.sampler.sample(&self.ctx, logit_idx);
            self.sampler.accept(token);

            // 检查结束
            if self.model.is_eog_token(token) {
                break;
            }

            // Token -> 文本
            let output_bytes = self.model.token_to_piece_bytes(token, 512, true, None)?;
            let mut token_str = String::with_capacity(32);
            let _ = decoder.decode_to_string(&output_bytes, &mut token_str, false);

            // 流式回调
            if let Some(ref mut cb) = callback {
                cb(&token_str);
            }

            output.push_str(&token_str);
            self.stats.total_generated += 1;

            // 编码新生成的 token，更新 KV Cache
            batch.clear();
            batch.add(token, self.n_past, &[0], true)?;
            self.n_past += 1;
            self.encoded_tokens.push(token);

            self.ctx.decode(&mut batch).context("生成解码失败")?;

            // 下一次采样时，logits 在新 batch 的位置 0
            logit_idx = 0;
        }

        let duration = start_time.elapsed();
        tracing::info!(
            "本地 LLM 回复完成，长度: {} bytes, 耗时: {:?}, KV: {}/{}",
            output.len(),
            duration,
            self.n_past,
            self.ctx.n_ctx()
        );

        // 7. 添加 assistant 消息到历史
        self.messages.push(ChatMessage::assistant(&output));
        self.stats.turn_count += 1;
        self.stats.tokens_used = self.n_past;

        Ok(output)
    }

    /// 找出新 tokens 与已编码 tokens 的公共前缀长度
    fn find_common_prefix(&self, new_tokens: &[LlamaToken]) -> usize {
        let mut common = 0;
        for (old, new) in self.encoded_tokens.iter().zip(new_tokens.iter()) {
            if old == new {
                common += 1;
            } else {
                break;
            }
        }
        common
    }

    /// 构建完整的提示词
    fn build_prompt(&self) -> Result<String> {
        let tmpl = match &self.chat_template {
            Some(t) => t,
            None => {
                return Ok(self
                    .messages
                    .iter()
                    .map(|m| format!("{}: {}", m.role.as_str(), m.content))
                    .collect::<Vec<_>>()
                    .join("\n"));
            }
        };

        let llama_messages: Vec<LlamaChatMessage> = self
            .messages
            .iter()
            .map(|m| {
                LlamaChatMessage::new(m.role.as_str().to_string(), m.content.clone())
                    .map_err(|e| anyhow::anyhow!("创建消息失败: {:?}", e))
            })
            .collect::<Result<Vec<_>>>()?;

        match self.model.apply_chat_template(tmpl, &llama_messages, true) {
            Ok(p) => Ok(p),
            Err(e) => {
                tracing::warn!("应用聊天模板失败: {:?}, 使用简单拼接", e);
                Ok(self
                    .messages
                    .iter()
                    .map(|m| format!("{}: {}", m.role.as_str(), m.content))
                    .collect::<Vec<_>>()
                    .join("\n"))
            }
        }
    }

    /// 添加消息到历史（不触发生成）
    pub fn add_message(&mut self, message: ChatMessage) {
        self.messages.push(message);
    }

    /// 获取对话历史
    pub fn history(&self) -> &[ChatMessage] {
        &self.messages
    }

    /// 获取对话轮次数
    pub fn turn_count(&self) -> usize {
        self.stats.turn_count
    }

    /// 获取统计信息
    pub fn stats(&self) -> &SessionStats {
        &self.stats
    }

    /// 获取剩余上下文容量
    pub fn remaining_ctx(&self) -> i32 {
        self.ctx.n_ctx() as i32 - self.n_past
    }

    /// 获取 KV Cache 复用率
    pub fn cache_reuse_rate(&self) -> f32 {
        let total = self.stats.total_prefilled + self.stats.cache_hits;
        if total == 0 {
            0.0
        } else {
            self.stats.cache_hits as f32 / total as f32
        }
    }

    /// 清除对话历史（保留 system prompt）
    ///
    /// 注意：这会重置 KV Cache
    pub fn clear(&mut self) {
        let system = self
            .messages
            .iter()
            .find(|m| m.role == Role::System)
            .cloned();

        self.messages.clear();
        if let Some(s) = system {
            self.messages.push(s);
        }

        // 重置 KV Cache 状态
        self.n_past = 0;
        self.encoded_tokens.clear();
        self.stats.turn_count = 0;
        self.stats.tokens_used = 0;
    }

    /// 完全重置会话（包括 system prompt）
    pub fn reset(&mut self) {
        self.messages.clear();
        self.n_past = 0;
        self.encoded_tokens.clear();
        self.stats = SessionStats {
            tokens_used: 0,
            ctx_size: self.ctx.n_ctx(),
            turn_count: 0,
            total_generated: 0,
            total_prefilled: 0,
            cache_hits: 0,
        };

        if let Some(ref system_prompt) = self.config.system_prompt {
            self.messages
                .push(ChatMessage::system(system_prompt.clone()));
        }
    }

    /// 设置新的 system prompt（会清除历史）
    pub fn set_system_prompt(&mut self, prompt: impl Into<String>) {
        self.messages.clear();
        self.messages.push(ChatMessage::system(prompt));
        self.n_past = 0;
        self.encoded_tokens.clear();
    }

    /// 获取会话信息
    pub fn info(&self) -> String {
        format!(
            "KV: {}/{}, 轮次: {}, 生成: {}, 复用率: {:.1}%",
            self.n_past,
            self.ctx.n_ctx(),
            self.stats.turn_count,
            self.stats.total_generated,
            self.cache_reuse_rate() * 100.0
        )
    }

    /// 估算剩余可用轮次
    pub fn estimate_remaining_turns(&self) -> usize {
        let remaining = self.remaining_ctx();
        let avg_tokens_per_turn = if self.stats.turn_count > 0 {
            self.n_past / self.stats.turn_count as i32
        } else {
            200
        };

        if avg_tokens_per_turn > 0 {
            (remaining / avg_tokens_per_turn) as usize
        } else {
            0
        }
    }
}
