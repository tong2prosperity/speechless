# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Prerequisites:** [Rust](https://rustup.rs/) (latest stable), [Bun](https://bun.sh/)

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev
# If cmake error on macOS:
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev

# Build for production
bun run tauri build

# Linting and formatting (run before committing)
bun run lint              # ESLint for frontend
bun run lint:fix          # ESLint with auto-fix
bun run format            # Prettier + cargo fmt
bun run format:check      # Check formatting without changes

# Check translation coverage
bun run check:translations
```

**Model Setup (Required for Development):**

```bash
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.Speechless.computer/silero_vad_v4.onnx
```

## Architecture Overview

Speechless (formerly Speechless) is a cross-platform desktop speech-to-text app built with Tauri 2.x (Rust backend + React/TypeScript frontend). It runs entirely offline — audio capture, VAD, transcription, and optional LLM post-processing all happen locally.

**Note:** The project uses a patched Tauri runtime (`tauri-runtime`, `tauri-runtime-wry`, `tauri-utils`) from `cjpais/tauri` branch `Speechless-2.9.1` — see `[patch.crates-io]` in `Cargo.toml`.

### Backend (src-tauri/src/)

**Entry points:**

- `main.rs` — CLI argument parsing (clap), then launches Tauri
- `lib.rs` — Tauri setup, plugin registration, manager initialization, signal handling

**Managers (`managers/`)** — Core business logic, initialized at startup and stored in Tauri managed state:

- `audio.rs` — Audio recording and device management
- `model.rs` — Model downloading (from ModelScope/HTTP) and file management
- `transcription.rs` — Speech-to-text pipeline orchestration
- `parakeet_sherpa.rs`, `sense_voice_sherpa.rs` — Transcription model backends (via `sherpa-rs`)
- `llm_manager.rs` — Local LLM lifecycle (load/unload GGUF models via `llama-cpp-2`)
- `history.rs` — Transcription history (SQLite via `rusqlite`)

**TranscriptionCoordinator (`transcription_coordinator.rs`)** — Critical component that serializes all transcription lifecycle events (keyboard input, signals, cancel, processing-finished) through a single thread via `mpsc` channel. Eliminates race conditions between shortcuts, CLI signals, and the async pipeline.

**Other key modules:**

- `commands/` — Tauri command handlers (annotated with `#[tauri::command]` + `#[specta::specta]` for auto-generated TS bindings)
- `navi_llm/` — Local LLM inference engine (config, model loading, chat sessions)
- `shortcut/` — Global keyboard shortcut handling (dual implementation: `Speechless-keys` crate + Tauri global-shortcut plugin)
- `actions.rs` — Maps shortcut bindings to transcription actions
- `settings.rs` — Application settings (persisted via `tauri-plugin-store`)
- `audio_toolkit/` — Low-level audio: device enumeration, recording, resampling (`rubato`), VAD (`vad-rs` with Silero)
- `overlay.rs` — Recording overlay window (uses `tauri-nspanel` on macOS, `gtk-layer-shell` on Linux)
- `cli.rs` — CLI argument definitions; `signal_handle.rs` — Unix signal + CLI remote control
- `input.rs` — Keyboard simulation via `enigo` for pasting transcribed text
- `clipboard.rs` — Clipboard operations
- `tray.rs` / `tray_i18n.rs` — System tray icon and localized menu

**Pipeline:** Audio → VAD (silence filtering) → Whisper/Parakeet/SenseVoice (transcription) → Optional LLM post-processing → Clipboard/Paste

### Frontend (src/)

- `App.tsx` — Main component with onboarding flow
- `bindings.ts` — Auto-generated Tauri type bindings (via `tauri-specta`). Do not edit manually; regenerated from Rust command signatures.
- `stores/settingsStore.ts` — Zustand store for settings
- `hooks/` — `useSettings.ts`, `useModels.ts` and other state management hooks
- `components/settings/` — Settings UI panels
- `components/model-selector/` — Model management interface
- `components/onboarding/` — First-run experience
- `overlay/` — Recording overlay window (separate Tauri window)

**State Flow:** Zustand → Tauri Command → Rust State → Persistence (tauri-plugin-store)

### Key Patterns

**Command-Event Architecture:** Frontend → Backend via Tauri commands; Backend → Frontend via Tauri events.

**tauri-specta:** All Tauri commands are annotated with `#[specta::specta]` which auto-generates TypeScript type bindings in `src/bindings.ts`. When adding/modifying commands, the bindings regenerate on build.

**Manager Pattern:** Core functionality organized into managers initialized at startup and stored via `app.manage()`. Access in commands via Tauri's state extraction.

## Internationalization (i18n)

All user-facing strings must use i18next translations. ESLint enforces this (no hardcoded strings in JSX).

**Adding new text:**

1. Add key to `src/i18n/locales/en/translation.json` (English is the source of truth)
2. Use in component: `const { t } = useTranslation(); t('key.path')`
3. Run `bun run check:translations` to verify coverage across all 17 locales

**Supported locales:** ar, cs, de, en, es, fr, it, ja, ko, pl, pt, ru, tr, uk, vi, zh, zh-TW

## Code Style

**Rust:**

- Run `cargo fmt` and `cargo clippy` before committing
- Handle errors explicitly (avoid unwrap in production)
- Path aliases: `@/` → `./src/` (TypeScript)

**TypeScript/React:**

- Strict TypeScript, avoid `any` types
- Functional components with hooks
- Tailwind CSS for styling

## Commit Guidelines

Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`

## CLI Parameters

Speechless supports command-line parameters on all platforms for integration with scripts, window managers, and autostart configurations.

**Implementation files:**

- `src-tauri/src/cli.rs` — CLI argument definitions (clap derive)
- `src-tauri/src/main.rs` — Argument parsing before Tauri launch
- `src-tauri/src/lib.rs` — Applying CLI overrides (setup closure + single-instance callback)
- `src-tauri/src/signal_handle.rs` — `send_transcription_input()` reusable function

**Available flags:**

| Flag                     | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `--toggle-transcription` | Toggle recording on/off on a running instance (via `tauri_plugin_single_instance`) |
| `--toggle-post-process`  | Toggle recording with post-processing on/off on a running instance                 |
| `--cancel`               | Cancel the current operation on a running instance                                 |
| `--start-hidden`         | Launch without showing the main window (tray icon still visible)                   |
| `--no-tray`              | Launch without the system tray icon (closing window quits the app)                 |
| `--debug`                | Enable debug mode with verbose (Trace) logging                                     |

**Key design decisions:**

- CLI flags are runtime-only overrides — they do NOT modify persisted settings
- Remote control flags (`--toggle-transcription`, `--toggle-post-process`, `--cancel`) work by launching a second instance that sends its args to the running instance via `tauri_plugin_single_instance`, then exits
- `send_transcription_input()` in `signal_handle.rs` is shared between signal handlers and CLI to avoid code duplication
- `CliArgs` is stored in Tauri managed state (`.manage()`) so it's accessible in `on_window_event` and other handlers

## Debug Mode

Access debug features: `Cmd+Shift+D` (macOS) or `Ctrl+Shift+D` (Windows/Linux)

## Platform Notes

- **macOS**: Metal acceleration, accessibility permissions required, `tauri-nspanel` for overlay
- **Windows**: Vulkan acceleration, code signing, custom `windows` crate features for audio endpoints
- **Linux**: OpenBLAS + Vulkan, `gtk-layer-shell` for overlay, limited Wayland support, overlay disabled by default
