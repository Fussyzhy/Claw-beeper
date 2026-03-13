---
name: claw-beeper-mobile-voice
description: Transcribe and understand inbound voice messages, then answer from the transcript. Use when the user sends an audio attachment (`.ogg`, `.opus`, `.mp3`, `.wav`, `.m4a`, `.aac`, `.webm`) or asks to 听一下语音、转写语音、识别语音内容、总结语音、翻译语音. Also use when Codex needs to add or refine mobile voice messages, 录音权限与采集, 音频上传, 语音消息 schema, object storage, local speech-to-text/transcription with nodejs-whisper, playback UI, 风控限流, or rollout and testing for iOS, Android, H5, WebView, or hybrid chat clients.
---

# Claw Beeper Mobile Voice

## Primary Behavior
When the user sends a voice message or other supported audio file, prefer to transcribe it first and answer from the transcript instead of saying you cannot understand audio.

## Supported Inputs
Accept these formats when available as local files or URLs:
- `.ogg`
- `.opus`
- `.mp3`
- `.wav`
- `.m4a`
- `.aac`
- `.webm`

## Voice Handling Workflow
1. Identify the audio file path or URL from the current request context.
2. If the user only asked to save or move the file, do that first and do not transcribe unless they also asked to understand it.
3. For transcription, run `node scripts/transcribe-audio.js --input <audio-path> --format text` from the skill root.
4. If text output is empty or unclear, retry with `--format json` so you can inspect the raw structure before answering.
5. Answer in normal conversational language based on the transcript. Quote uncertain parts sparingly instead of pretending confidence.
6. If the user asked for summary, translation, cleanup, or action items, do that after transcription.
7. If transcription fails, explain the concrete reason: missing model, missing `whisper-cli`, unsupported codec, runtime/build issue, or unreadable audio.

## Local Runtime
- Use `scripts/transcribe-audio.js` as the default local ASR entry point.
- Expect the bundled FFmpeg binary at `tools/ffmpeg/bin/ffmpeg.exe` on Windows. The script prepends that directory to the process path automatically.
- Expect the Whisper model file at `node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin` when running with `--model base`.
- Expect the compiled CLI at `node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli.exe` on Windows, or let `nodejs-whisper` build it if the environment has CMake and a C++ toolchain.
- Prefer `--format text` for direct chat replies. Prefer `--format json` when another service or worker will write transcript results back into Claw Beeper.

## Fallback Rules
- Do not claim you listened to audio unless you actually ran transcription or were given a transcript by the platform.
- If the current session cannot see the new skill yet, tell the user a session reload or restart may be required.
- If the audio is too noisy or very short, say which parts are uncertain.
- Preserve the original file even if transcription fails.

## Product/Implementation Mode
If the user is not asking to understand one specific voice message, and instead wants to build or modify the product capability itself, switch into implementation mode.

In that mode:
1. Inspect the current message pipeline before proposing new tables or endpoints.
2. Reuse existing message, media, auth, and realtime primitives when possible.
3. Read `references/workflow.md` before changing architecture.
4. Clarify the client only if it materially changes the solution.

## Working Rules
- Prefer asynchronous processing for product implementations. Let the user send audio first, then finish transcription and waveform generation in the background.
- Treat transcription as an enhancement, not a hard blocker for message delivery, unless the product explicitly requires transcript-first behavior.
- Store audio metadata separately from transcript and status fields so failed transcription does not corrupt the original media record.
- Extend the existing message type system instead of inventing a parallel voice-only pipeline.
- Validate duration, bytes, codec, MIME, and ownership on the server. Do not trust filename extensions or client-reported metadata alone.
- Reuse the current upload/auth mechanism when possible. Only add a dedicated upload flow if the existing media endpoint cannot satisfy the requirement.
- Design for retries and idempotency. Mobile uploads are interruption-prone.

## Deliverables for Product Work
When asked to implement or plan the feature, return:
- the current-state findings that matter,
- the concrete schema, API, client, worker, and job changes,
- the local runtime expectations for `ffmpeg`, `whisper-cli`, and model files,
- the key risks and fallback behavior,
- the tests needed for client, server, and end-to-end coverage.

## Reference
- `references/workflow.md`: Default architecture, local runtime layout, Claw Beeper write-back contract, failure modes, and acceptance checklist for mobile voice messaging.

## Avoid
- Saying you cannot understand audio without first checking whether an attached file can be transcribed locally.
- Blocking the chat send path on long-running ASR jobs in product implementations.
- Adding a new storage system if existing object storage or media infrastructure already works.
- Hard-coding one codec without checking browser and device support.
- Returning a design with no quota, abuse, or privacy controls.
- Assuming `nodejs-whisper download` is the only valid setup path; allow manually supplied model files and prebuilt `whisper-cli` binaries.
