---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Media endpoints now match each provider's documented parameters:

- **Images:** GPT Image 2.6 takes `complexity` (low, medium, high). `gpt-image-1-mini` edits take `input_fidelity: "low"`. Together receives `size` as width and height and `b64_json` as `base64`. Gemini 3 Pro Image sizes snap to the ratios it supports.
- **Video:** LTX takes `generate_audio: false` and enforces each model's input-audio limits. Wan 3.0 takes 21:9 and automatic duration (`provider_params.smart_duration`, billed by the length Alibaba reports). Vertex Veo takes `compression_quality` as `optimized` or `lossless`. FLUX 3 video takes 9:21 and `safety_tolerance` up to 7. Grok Imagine 1.5 does text-to-video.
- **Speech:** Gemini 3.8 TTS takes custom voice IDs, returns WAV or PCM as asked, and older Gemini TTS models return a real WAV file for `wav`. xAI TTS checks speed against 0.7–1.5 and lets you set the language. MiMo VoiceDesign no longer sends a voice.
- **Transcription and embeddings:** file size limits follow each provider (Groq 25 MB, Together 80 MB, xAI 500 MB, Xiaomi about 7.5 MB). xAI `grok-voice-transcribe-2.0` takes keyterms. ElevenLabs keyterms can be 50 characters. Voxtral 3 `context_bias` takes phrases. Fireworks embeddings no longer forward `encoding_format`; base64 is encoded by Phaseo.
- **Playground:** voice lists per speech model family, and all 31 GPT Live voices.
