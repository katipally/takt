# Voice

Voice is built on the browser's native speech APIs, so it needs no extra keys or services.

- **Speech in** — the mic button uses `SpeechRecognition` (Web Speech API). Press it, speak your question, and the transcript fills the composer. Interim results show as you talk.
- **Speech out** — toggle the speaker button to have answers read back via `speechSynthesis` when a turn finishes.

## Support

Web Speech is best supported in Chrome and Edge. In browsers without it, the mic button tells you so and everything else works as normal text chat. Spoken output strips markdown and citation markers before reading.

## Upgrading

For higher-quality or cross-browser voice, swap in a cloud STT (Whisper) and TTS (e.g. ElevenLabs) behind the existing provider system. The composer's mic handler and the `speak()` helper in `useWorkbench` are the two seams to replace; the rest of the UI is unchanged. This was left out of the default build to keep the required-keys count at one.
