use speechless_app_lib::navi_llm::{LlmConfig, LlmModel};
use std::io::{self, Write};
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let model_path = PathBuf::from("/tmp/model.gguf");

    println!("--- 本地 LLM 测试 ---");
    println!("尝试加载模型: {:?}", model_path);

    if !model_path.exists() {
        println!("错误: 模型文件不存在！");
        return Ok(());
    }

    let config = LlmConfig::new(&model_path)
        .with_ctx_size(2048)
        .with_max_tokens(512)
        .with_verbose(true);

    println!("正在初始化模型...");
    let start = std::time::Instant::now();
    let model = LlmModel::load(config)?;
    println!("模型加载成功！耗时: {:?}", start.elapsed());

    let prompt = "你好，请介绍一下你自己。";
    println!("\n问: {}", prompt);
    print!("答: ");
    io::stdout().flush()?;

    model.complete_streaming(prompt, |token| {
        print!("{}", token);
        let _ = io::stdout().flush();
    })?;

    println!("\n测试完成！");
    Ok(())
}
