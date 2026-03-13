# Mobile Voice Workflow

## Inspect First

Read the current codebase in this order before proposing changes:

1. Message schema and message type enum.
2. Existing media upload flow and auth model.
3. Object storage or file persistence layer.
4. Realtime event delivery for new messages and updates.
5. Background jobs used for media processing, notifications, or moderation.

## Recommended Default Architecture

Use this flow unless the existing system strongly suggests a better one:

1. Client records a short audio clip on phone.
2. Client uploads the clip through the current media upload path or an audio-specific upload init endpoint.
3. Server stores the raw audio and creates a chat message in `processing` or `uploaded` state.
4. Realtime channel broadcasts the placeholder voice message immediately so ordering is preserved.
5. Background jobs transcode if needed, extract duration or waveform metadata, and run speech-to-text.
6. Server updates the same message with final media metadata and transcript status.
7. Clients refresh the message card when status changes arrive.

## Minimum Data to Persist

Persist the smallest set that supports playback, retries, and transcription:

- `message_id`
- `conversation_id`
- `sender_id`
- `message_type = voice`
- `object_key` or `media_url`
- `mime_type`
- `codec`
- `duration_ms`
- `bytes`
- `transcript_text` nullable
- `transcription_status` as `pending | running | done | failed`
- `processing_error` nullable
- `created_at`
- `updated_at`

If the system already has a generic attachment table, prefer extending it instead of creating a voice-only store.

## API Guidance

### Upload

Prefer one of these patterns:

- Reuse an existing `POST /uploads` style endpoint and tag the upload as audio.
- Add `POST /uploads/audio` only if the current upload path cannot express audio limits or metadata.

Useful request fields:

- `filename`
- `size`
- `mime_type`
- `duration_ms` if known
- `conversation_id` if upload permissions depend on room membership

Useful response fields:

- `upload_url` or `form_fields`
- `media_token` or `object_key`
- `expires_at`

### Message Creation

Create the voice message through the normal chat creation path when possible.

Suggested payload:

- `conversation_id`
- `type = voice`
- `media_token` or `object_key`
- `client_msg_id` for idempotency

Suggested response:

- message id
- message status
- playback URL or storage pointer
- transcript status
- created timestamp

### Realtime Updates

- Broadcast message creation immediately after the server accepts the send.
- Broadcast processing updates when transcription or transcoding finishes.
- Make update events idempotent because clients can receive duplicates or out-of-order events.

## Client Checklist

- Request microphone permission just in time.
- Show clear states for record, stop, cancel, send, upload retry, and transcription pending.
- Enforce duration and size limits before upload if the platform exposes them.
- Preserve unsent text input if voice upload fails.
- Separate upload failure UI from transcript failure UI.
- Allow playback even when transcript generation fails.
- Handle app backgrounding and flaky mobile networks.
- Provide a fallback when the platform cannot record in the preferred codec.

## Format Defaults

- Prefer `audio/webm;codecs=opus` in mobile browsers that support `MediaRecorder`.
- Prefer `m4a` or AAC on native clients if that already fits the media pipeline.
- Transcode server-side only when storage, playback, or ASR normalization requires it.
- Avoid PCM or WAV as the default mobile format unless clips are very short and storage is negligible.

## Security and Policy

- Reuse authenticated upload tokens.
- Verify that the sender owns the uploaded object before attaching it to a message.
- Apply duration, size, rate-limit, and daily quota controls.
- Reuse existing file scanning or moderation hooks if the platform already has them.
- Define transcript retention and privacy policy explicitly.
- Consider whether transcripts should be searchable, redactable, or exportable.

## Failure Strategy

- Upload fails: keep the local draft and allow retry.
- Message creation fails after upload: use object cleanup or delayed deletion for orphaned files.
- Transcription fails: keep the audio playable and mark transcript as unavailable.
- Transcoding fails: mark the message failed only if the original file cannot be played or processed safely.
- Realtime update missed: refetch room messages on resume or reconnect.

## Acceptance Checklist

- A phone user can record and send a voice message end to end.
- Another participant can receive and play the same message.
- Message ordering remains correct relative to text and image messages.
- Retry with the same `client_msg_id` does not create duplicate messages.
- Transcript can appear later without changing message identity.
- Permission denied, duration limit, and file-too-large errors are user friendly.
- Deleting the message also cleans up or tombstones related media according to product policy.

## Reuse Before Inventing

If the codebase already contains these pieces, extend them:

- Existing file upload service
- Existing audio playback component
- Existing background job queue
- Existing moderation pipeline
- Existing storage lifecycle cleanup
