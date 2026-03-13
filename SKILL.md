---
name: openclaw-mobile-voice
description: 帮助规划、设计和实现 OpenClaw 中“用户通过手机发送语音”的能力。Use when Codex needs to add or refine mobile voice messages, 录音权限与采集, 音频上传, 语音消息 schema, object storage, speech-to-text/transcription, playback UI, 风控限流, or rollout and testing for iOS, Android, H5, WebView, or hybrid chat clients.
---

# OpenClaw Mobile Voice

## Goal
Add or improve a voice-message flow that lets phone users record, upload, send, transcribe, store, and play audio inside OpenClaw without breaking the existing text chat path.

## Start Here
1. Inspect the current message pipeline before proposing new tables or endpoints. Reuse existing message, media, auth, and realtime primitives when possible.
2. Read `references/workflow.md` before changing architecture. Use it as the default checklist for API shape, state transitions, storage, transcription, and acceptance cases.
3. Clarify the client only if it materially changes the solution. Otherwise assume a mobile chat surface that may run as a native app, H5 page, or WebView.

## Working Rules
- Prefer asynchronous processing. Let the user send audio first, then finish transcription and waveform generation in the background.
- Treat transcription as an enhancement, not a hard blocker for message delivery, unless the product explicitly requires transcript-first behavior.
- Store audio metadata separately from transcript and status fields so failed transcription does not corrupt the original media record.
- Extend the existing message type system instead of inventing a parallel voice-only pipeline.
- Validate duration, bytes, codec, MIME, and ownership on the server. Do not trust filename extensions or client-reported metadata alone.
- Reuse the current upload/auth mechanism when possible. Only add a dedicated upload flow if the existing media endpoint cannot satisfy the requirement.
- Design for retries and idempotency. Mobile uploads are interruption-prone.

## Deliverables
When asked to implement or plan the feature, return:
- the current-state findings that matter,
- the concrete schema, API, client, and job changes,
- the key risks and fallback behavior,
- the tests needed for client, server, and end-to-end coverage.

## Reference
- `references/workflow.md`: Default architecture, API suggestions, failure modes, and acceptance checklist for mobile voice messaging in OpenClaw.

## Avoid
- Blocking the chat send path on long-running ASR jobs.
- Adding a new storage system if existing object storage or media infrastructure already works.
- Hard-coding one codec without checking browser and device support.
- Returning a design with no quota, abuse, or privacy controls.
