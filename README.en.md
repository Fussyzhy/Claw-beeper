# Claw Beeper

<p align="center">
  <a href="./README.md">简体中文</a> | <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="./assets/cover.svg" alt="Claw Beeper cover" width="100%" />
</p>

<p align="center">
  <strong>A Codex skill and local CLI for mobile voice transcription in Claw Beeper.</strong>
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%2B-0F172A?style=for-the-badge&logo=node.js&logoColor=white" />
  <img alt="Whisper" src="https://img.shields.io/badge/Whisper-nodejs--whisper-0F172A?style=for-the-badge&logo=waveform&logoColor=white" />
  <img alt="FFmpeg" src="https://img.shields.io/badge/FFmpeg-bundled-0F172A?style=for-the-badge&logo=ffmpeg&logoColor=white" />
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-0F172A?style=for-the-badge&logo=windows&logoColor=white" />
</p>

## Overview

Claw Beeper is a local voice-transcription skill for Codex. It handles audio files such as `.ogg`, `.mp3`, `.wav`, `.m4a`, `.aac`, and `.webm`, converts them to a Whisper-compatible WAV when needed, and returns text output through a small Node.js CLI.

The repository also documents the product-side integration path for mobile voice messages in Claw Beeper: upload, message creation, async transcription, transcript write-back, and failure handling.

## Features

- Local speech-to-text using `nodejs-whisper`
- Bundled project-local `ffmpeg` support
- Supports local files and remote audio URLs
- Text and JSON output modes
- Ready to plug into async workers for Claw Beeper message processing
- Covers mobile voice-message product design and runtime troubleshooting

## Tech Stack

| Layer | Stack |
| --- | --- |
| Runtime | Node.js 22+, CommonJS |
| Speech-to-text | `nodejs-whisper` |
| Audio conversion | FFmpeg |
| Whisper backend | `whisper.cpp` + `ggml-base.bin` |
| Skill metadata | `SKILL.md` + `agents/openai.yaml` |
| Target environment | Windows-first local runtime |

## Repository Layout

```text
.
|-- README.md
|-- README.en.md
|-- SKILL.md
|-- package.json
|-- agents/
|   `-- openai.yaml
|-- assets/
|   `-- cover.svg
|-- references/
|   `-- workflow.md
|-- scripts/
|   `-- transcribe-audio.js
`-- tools/
    `-- ffmpeg/
```

## Current Runtime Assumptions

This repository currently assumes the following local runtime layout:

- FFmpeg binary: `tools/ffmpeg/bin/ffmpeg.exe`
- Whisper model: `node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin`
- Whisper CLI: `node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli.exe`

The transcription script prepends the bundled FFmpeg directory to the process path automatically. `whisper-cli.exe` and the model file still need to exist in the expected `nodejs-whisper` locations.

## Installation

### 1. Install Node.js

Use Node.js `22+`.

### 2. Install dependencies

```bash
npm install
```

### 3. Provide the local Whisper runtime

Make sure these files exist:

- `node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin`
- `node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli.exe`

If you are building `whisper-cli.exe` yourself on Windows, also make sure the required MinGW/MSYS2 runtime DLLs are available through the user `Path` or next to `whisper-cli.exe`.

## Usage

### Basic transcription

```bash
node scripts/transcribe-audio.js --input "C:/path/to/audio.ogg" --model base --format text
```

### JSON output

```bash
node scripts/transcribe-audio.js --input "C:/path/to/audio.ogg" --model base --format json
```

### Verbose mode

```bash
node scripts/transcribe-audio.js --input "C:/path/to/audio.ogg" --model base --format text --verbose
```

### NPM shortcuts

```bash
npm run check:transcribe
npm run transcribe -- --input "C:/path/to/audio.ogg" --model base --format text
npm run transcribe:verbose -- --input "C:/path/to/audio.ogg" --model base --format text
```

## CLI Options

| Option | Description |
| --- | --- |
| `--input <path|url>` | Local audio file path or remote URL |
| `--model <name>` | Whisper model name. Default: `base` |
| `--format <json|text>` | Output format. Default: `json` |
| `--output <path>` | Write output to a file |
| `--verbose` | Print `nodejs-whisper` debug logs |
| `--remove-wav-file` | Remove intermediate WAV after transcription |
| `--keep-wav-file` | Keep intermediate WAV after transcription |
| `--with-cuda` | Ask `nodejs-whisper` to use CUDA when available |
| `--word-timestamps` | Request word-level timestamps |
| `--translate-to-english` | Translate source audio to English |
| `--timestamps-length <n>` | Configure timestamp chunk length |

## Supported Input Formats

- `.ogg`
- `.opus`
- `.mp3`
- `.wav`
- `.m4a`
- `.aac`
- `.webm`

Non-WAV files are converted to `16kHz` mono WAV before transcription.

## Example Output

### `--format text`

```text
你可以听懂我说话吗?
```

### `--format json`

```json
{
  "provider": "nodejs-whisper",
  "model": "base",
  "sourcePath": "C:\\path\\to\\audio.ogg",
  "sourceName": "audio.ogg",
  "text": "你可以听懂我说话吗?",
  "raw": "..."
}
```

## Using It As a Codex Skill

The skill entrypoint is defined in [SKILL.md](./SKILL.md). It supports two main modes:

- Audio understanding mode: transcribe a user-supplied audio file and answer from the transcript
- Product implementation mode: design or extend Claw Beeper mobile voice-message capabilities

Relevant metadata lives in [agents/openai.yaml](./agents/openai.yaml).

## Claw Beeper Integration Model

This repository documents the recommended product flow for Claw Beeper mobile voice messages:

1. Record audio on mobile
2. Upload audio through the media pipeline
3. Create a `voice` message with a pending or processing state
4. Run async transcription through `scripts/transcribe-audio.js`
5. Write back `transcript_text`, `transcription_status`, and error metadata
6. Push message updates to clients

Detailed integration notes are in [references/workflow.md](./references/workflow.md).

## Troubleshooting

### Windows exit code `3221225781`

Treat this as a runtime DLL problem for `whisper-cli.exe`. Typical fix:

- add the MinGW/MSYS2 runtime directory to the user `Path`, or
- copy the required DLLs next to `whisper-cli.exe`

### `Model file does not exist`

Confirm the selected model matches the actual file name. For `--model base`, the file must be:

```text
node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin
```

### FFmpeg conversion fails

Confirm this file exists:

```text
tools/ffmpeg/bin/ffmpeg.exe
```

### Git Bash path issues

If you are using Git Bash, prefer forward slashes in commands:

```bash
node scripts/transcribe-audio.js --input "C:/Users/Administrator/Desktop/test.ogg" --model base --format text
```

## Development Notes

- The current repository is Windows-oriented.
- The bundled FFmpeg path is project-local by design.
- The current documented model target is `base`.
- The repository is ready for open-sourcing as a working prototype and integration reference, not as a general-purpose npm package.

## Publish Checklist

Before publishing, confirm these repo-level items explicitly:

- Add a `LICENSE` file
- Decide whether `node_modules/`, model files, and compiled binaries should stay versioned
- Add example audio or screenshots only if you want reproducible demos
- Review secrets and environment-specific paths

