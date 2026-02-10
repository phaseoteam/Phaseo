# AI Gateway Executors - Complete Provider Coverage (2026)

This document outlines all provider executors implemented in the AI Gateway, organized by provider (capability subfolders).

## 📊 Summary

- **Total Text Generation Providers**: 28 providers (including Google Nano Banana multimodal models)
- **Image Generation**: OpenAI (DALL-E 3, DALL-E 2), Fal.ai (600+ models)
- **Video Generation**: Google (Veo 3.1, Veo 3.1 Fast, Veo 2), Fal.ai (Veo 3, Hunyuan, MiniMax, etc.)
- **Audio Generation**: OpenAI (TTS-1, TTS-1-HD, GPT-4o-mini-TTS), Fal.ai (TTS, music generation)

---

## 🤖 Text Generation Executors (`text.generate`)

### Core Providers

| Provider | Status | Documentation | Notes |
|----------|--------|---------------|-------|
| **OpenAI** | ✅ Active | [Docs](https://platform.openai.com/docs) | GPT-4, GPT-4o, o1, o3 with reasoning support |
| **Anthropic** | ✅ Active | [Docs](https://docs.anthropic.com/) | Claude 3.5 Sonnet, Opus with extended thinking |
| **Google** | ✅ Active | [Docs](https://ai.google.dev/) | **Native implementation** - Gemini 2.0, 1.5 Pro/Flash with thinking mode + **Nano Banana** image-generating models |
| **Google AI Studio** | ✅ Active | [Docs](https://ai.google.dev/gemini-api) | Same as Google provider (native Gemini API) |

#### Google Gemini - Native Implementation

**Important:** Google Gemini uses a **native implementation**, not OpenAI-compatible format. Key differences:

- **Model in URL**: Model is part of the URL path (`/v1beta/models/{model}:generateContent`), not request body
- **Request Structure**: Uses `contents` array with `parts` (not `messages`)
- **Response Structure**: Returns `candidates` with `content.parts` (not `choices`)
- **System Messages**: Separate `systemInstruction` field (not in contents)
- **Parameters**: `generationConfig` with `maxOutputTokens`, `topK`, etc.
- **Thinking Mode**: Uses `thinkingBudget.tokens` in `generationConfig`

#### Google Nano Banana Models (Multimodal Output)

**Special Feature:** Google's Nano Banana models (`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`) are unique text.generate models that can output **both text and images** in a single response:

- **Text parts** - Regular text output
- **Image parts** - Generated images as base64-encoded `inline_data`
- **Thought signatures** - For preserving reasoning context across multi-turn conversations

Example prompts:
- "Create a logo for my coffee shop and explain the design choices"
- "Generate a diagram of how photosynthesis works with detailed annotations"

The gateway automatically handles the mixed-media responses through native Google API parsing and IR conversion.

### High-Performance Providers

| Provider | Status | Documentation | Speed | Notes |
|----------|--------|---------------|-------|-------|
| **Groq** | ✅ NEW | [Docs](https://console.groq.com/docs/openai) | 🚀 Ultra-fast | LPU-powered, OpenAI-compatible |
| **Cerebras** | ✅ NEW | [Docs](https://inference-docs.cerebras.ai/) | 🚀 3000+ tok/s | Wafer-Scale Engine |
| **Together** | ✅ NEW | [Docs](https://docs.together.ai/) | ⚡ Fast | 200+ open models |
| **Fireworks** | ✅ NEW | [Docs](https://docs.fireworks.ai/) | ⚡ Fast | Compound AI, MCP support |

### Chinese AI Providers

| Provider | Status | Documentation | Specialty |
|----------|--------|---------------|-----------|
| **DeepSeek** | ✅ Active | [Docs](https://api-docs.deepseek.com/) | Reasoning models (V3.2) |
| **Xiaomi MiMo** | ✅ Active | [GitHub](https://github.com/XiaomiMiMo/MiMo-V2-Flash) | MiMo-V2-Flash (309B MoE) |
| **MiniMax** | ✅ Active | [Docs](https://platform.minimax.io/) | M2.1 with interleaved thinking |
| **Z.AI (GLM)** | ✅ Active | [Docs](https://docs.z.ai/) | Zhipu AI GLM models |
| **Alibaba/Qwen** | ✅ NEW | [Docs](https://dashscope.aliyuncs.com/) | Qwen 2.5, QVQ, QwQ |
| **Moonshot AI** | ✅ NEW | [Docs](https://platform.moonshot.cn/) | Long context models |

### International Providers

| Provider | Status | Documentation | Specialty |
|----------|--------|---------------|-----------|
| **xAI** | ✅ Active | [Docs](https://docs.x.ai/) | Grok with real-time data |
| **Mistral** | ✅ NEW | [Docs](https://docs.mistral.ai/) | European AI, open models |
| **Cohere** | ✅ NEW | [Docs](https://docs.cohere.com/) | Enterprise RAG, embeddings |
| **Perplexity** | ✅ NEW | [Docs](https://docs.perplexity.ai/) | Search-augmented responses |
| **Liquid AI** | ✅ NEW | [Docs](https://docs.liquid.ai/) | Efficient reasoning models |

### Infrastructure Providers

| Provider | Status | Documentation | Specialty |
|----------|--------|---------------|-----------|
| **DeepInfra** | ✅ NEW | [Docs](https://deepinfra.com/docs) | Multi-cloud inference |
| **NovitaAI** | ✅ NEW | [Docs](https://docs.novita.ai/) | Global inference network |
| **Baseten** | ✅ NEW | [Docs](https://docs.baseten.co/) | ML infrastructure platform |
| **AION Labs** | ✅ Active | Internal | Custom models |

---

## 🎨 Image Generation Executors (`image.generate`)

### Major Providers

| Provider | Status | Models Available | Documentation |
|----------|--------|------------------|---------------|
| **OpenAI** | ✅ NEW | DALL-E 3, DALL-E 2 | [Docs](https://platform.openai.com/docs/guides/images) |
| **Fal.ai** | ✅ NEW | 600+ models | [Docs](https://fal.ai/) |

#### OpenAI - DALL-E Models

- **DALL-E 3** (Scheduled deprecation: May 12, 2026):
  - Resolutions: 1024x1024, 1024x1792, 1792x1024
  - Quality: standard, hd
  - Style: vivid, natural
  - Single image per request (n=1 only)

- **DALL-E 2**:
  - Resolutions: 256x256, 512x512, 1024x1024
  - Lower cost, faster generation
  - Multiple images per request

#### Fal.ai - Unified Image API

- **FLUX Family**:
  - `fal-ai/flux/schnell` - Ultra-fast generation
  - `fal-ai/flux/dev` - High quality
  - `fal-ai/flux/pro` - Professional grade
- **Stable Diffusion**:
  - `fal-ai/stable-diffusion-v3`
  - `fal-ai/sd-xl`
  - `fal-ai/sd-turbo`
- **Specialty Models**:
  - Runway ML models
  - Midjourney-style models
  - And 590+ more

#### Example Usage

**OpenAI DALL-E 3:**
```bash
POST /v1/images/generations
{
  "model": "dall-e-3",
  "prompt": "A serene landscape with mountains",
  "size": "1024x1024",
  "quality": "hd",
  "style": "natural",
  "response_format": "url"
}
```

**Fal FLUX:**
```bash
POST /v1/images/generations
{
  "model": "fal-ai/flux/schnell",
  "prompt": "A serene landscape with mountains",
  "num_images": 4,
  "image_size": {
    "width": 1024,
    "height": 1024
  },
  "seed": 42
}
```

---

## 🎬 Video Generation Executors (`video.generate`)

### Major Providers

| Provider | Status | Models Available | Documentation |
|----------|--------|------------------|---------------|
| **Google** | ✅ NEW | Veo 3.1, Veo 3.1 Fast, Veo 2 | [Docs](https://ai.google.dev/gemini-api/docs/video) |
| **Fal.ai** | ✅ NEW | 20+ models | [Docs](https://fal.ai/video) |

#### Google Veo - Native Implementation

- **Veo 3.1 Preview** (`veo-3.1-generate-preview`):
  - 720p, 1080p, 4k resolution support
  - 4, 6, or 8 second videos
  - Aspect ratios: 16:9, 9:16
  - Native audio generation
  - Text-to-video, image-to-video, video extension
  - Reference images (up to 3) for style/content guidance
  - Updated January 2026

- **Veo 3.1 Fast Preview** (`veo-3.1-fast-generate-preview`):
  - Speed-optimized version
  - Same capabilities as Veo 3.1

- **Veo 2 Stable** (`veo-2.0-generate-001`):
  - 720p only, no audio
  - Up to 2 videos per request

**Note:** Uses long-running operations - requires polling for completion

#### Fal.ai - Unified Video API

- **Google Veo 3**: `fal-ai/veo3` - Most advanced AI video model
- **Hunyuan Video**: `fal-ai/hunyuan-video` - Open source, high quality
- **MiniMax**: `fal-ai/minimax-video` - Text-to-video
- **Mochi V1**: `fal-ai/mochi-v1` - High quality generation
- **Kling Video**: `fal-ai/kling-video/v1/standard` - Image-to-video
- **Veo 2**: `fal-ai/veo2/image-to-video` - Google's image-to-video
- **Luma Dream Machine**: `fal-ai/luma-dream-machine`

#### Example Usage

**Google Veo 3.1:**
```bash
POST /v1/video/generation
{
  "model": "veo-3.1-generate-preview",
  "prompt": "A cat playing piano in a jazz club",
  "aspect_ratio": "16:9",
  "resolution": "1080p",
  "duration_seconds": 8,
  "negative_prompt": "blurry, low quality"
}
```

**Fal Veo 3:**
```bash
POST /v1/video/generation
{
  "model": "fal-ai/veo3",
  "prompt": "A cat playing piano in a jazz club",
  "duration_seconds": 5,
  "fps": 24,
  "aspect_ratio": "16:9",
  "seed": 42
}
```

#### Image-to-Video Example

```bash
POST /v1/video/generation
{
  "model": "fal-ai/veo2/image-to-video",
  "prompt": "The character waves at the camera",
  "image_url": "https://example.com/image.jpg",
  "duration_seconds": 3
}
```

---

## 🎵 Audio Generation Executors (`audio.generate`)

### Major Providers

| Provider | Status | Capabilities | Documentation |
|----------|--------|--------------|---------------|
| **OpenAI** | ✅ NEW | TTS (tts-1, tts-1-hd, gpt-4o-mini-tts) | [Docs](https://platform.openai.com/docs/guides/text-to-speech) |
| **Fal.ai** | ✅ NEW | TTS, Music, Effects | [Docs](https://fal.ai/) |

#### OpenAI - Text-to-Speech

- **Models**:
  - `tts-1` - Standard quality, lower latency
  - `tts-1-hd` - High definition quality
  - `gpt-4o-mini-tts` - Latest model with instruction support
  - `gpt-4o-mini-tts-2025-12-15` - Dated snapshot

- **Voices**: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse, marin, cedar
- **Formats**: mp3, opus, aac, flac, wav, pcm
- **Speed**: 0.25 to 4.0 (default 1.0)
- **Instructions**: Custom voice control (gpt-4o-mini-tts only)

#### Example Usage

**OpenAI TTS:**
```bash
POST /v1/audio/generation
{
  "model": "gpt-4o-mini-tts",
  "input": "Welcome to our service! Today is a wonderful day.",
  "voice": "coral",
  "instructions": "Speak in a cheerful and positive tone.",
  "response_format": "mp3",
  "speed": 1.0
}
```

**Fal Audio:**
```bash
POST /v1/audio/generation
{
  "model": "fal-ai/audio-tts",
  "prompt": "Welcome to our service!",
  "voice": "en-US-Neural-Female",
  "duration_seconds": 10
}
```

---

## 🏗️ Architecture

### Executor Resolution Flow

```
Client Request
    ↓
Endpoint Detection (/v1/chat/completions, /v1/images/generations, etc.)
    ↓
Capability Mapping (text.generate, image.generate, video.generate, audio.generate)
    ↓
Provider Selection (based on model ID or gateway routing)
    ↓
Executor Resolution: resolveProviderExecutor(providerId, capability)
    ↓
Provider Execution (with IR transformation)
    ↓
Response Encoding (protocol-specific format)
    ↓
Client Response
```

### File Structure

```
apps/api/src/executors/
├── index.ts                      # Main executor resolver
├── types.ts                      # Shared types
├── _shared/
│   └── text-generate/
│       ├── shared.ts             # Common text.generate helpers
│       └── openai-compat/        # OpenAI-compatible adapter + transforms
├── openai/
│   ├── text-generate/
│   ├── image-generate/
│   └── audio-generate/
├── google/
│   ├── text-generate/
│   └── video-generate/
├── google-ai-studio/
│   └── text-generate/
├── anthropic/
│   └── text-generate/
├── fal/
│   ├── image-generate/
│   ├── video-generate/
│   └── audio-generate/
└── ... (one folder per provider)
```

---

## 🔧 Configuration

### Environment Variables

#### Text Generation

```bash
# Core Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GOOGLE_AI_STUDIO_API_KEY=...

# New High-Performance Providers
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=csk_...
TOGETHER_API_KEY=...
FIREWORKS_API_KEY=...

# Chinese Providers
DEEPSEEK_API_KEY=sk-...
XIAOMI_MIMO_API_KEY=...
MINIMAX_API_KEY=...
QWEN_API_KEY=...
MOONSHOT_AI_API_KEY=...

# International Providers
XAI_API_KEY=xai-...
MISTRAL_API_KEY=...
COHERE_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
LIQUID_AI_API_KEY=...

# Infrastructure Providers
DEEPINFRA_API_KEY=...
NOVITA_API_KEY=...
BASETEN_API_KEY=...
```

#### Multi-Modal Providers

```bash
# OpenAI (Image, Audio)
OPENAI_API_KEY=sk-...

# Google (Video, Text+Image via Nano Banana)
GOOGLE_API_KEY=...
GOOGLE_AI_STUDIO_API_KEY=...

# Fal.ai (Image, Video, Audio)
FAL_API_KEY=...
```

---

## 📚 Documentation Sources

All implementations verified against latest 2026 provider documentation:

### Core Providers
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic Messages API](https://docs.anthropic.com/en/docs/build-with-claude)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)

### High-Performance Providers
- [Groq OpenAI Compatibility](https://console.groq.com/docs/openai)
- [Together AI OpenAI Compatibility](https://docs.together.ai/docs/openai-api-compatibility)
- [Fireworks AI OpenAI Compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility)
- [Cerebras Inference Docs](https://inference-docs.cerebras.ai/introduction)

### Chinese Providers
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Xiaomi MiMo GitHub](https://github.com/XiaomiMiMo/MiMo-V2-Flash)
- [MiniMax Tool Use & Thinking](https://platform.minimax.io/docs/guides/text-m2-function-call)
- [Z.AI Thinking Mode](https://docs.z.ai/guides/capabilities/thinking-mode)

### Multi-Modal
- [Fal.ai Documentation](https://docs.fal.ai/)
- [Fal.ai Video Models](https://fal.ai/video)

---

## ✅ Testing Checklist

### Text Generation
- [x] OpenAI GPT-4o with reasoning
- [x] Anthropic Claude 3.5 Sonnet with extended thinking
- [x] Google Gemini 2.0 Flash Thinking
- [x] Groq Llama models (ultra-fast)
- [x] DeepSeek V3.2 with thinking mode
- [x] Xiaomi MiMo with enable_thinking
- [x] MiniMax M2.1 with reasoning_content

### Image Generation
- [ ] Fal FLUX/schnell
- [ ] Fal SDXL
- [ ] Fal Stable Diffusion V3

### Video Generation
- [ ] Fal Veo 3 text-to-video
- [ ] Fal Hunyuan Video
- [ ] Fal Veo 2 image-to-video

### Audio Generation
- [ ] Fal TTS
- [ ] Fal Music Generation

---

## 🚀 Next Steps

1. **Add More Image Providers**: Stability AI, Midjourney API (when available)
2. **Add More Video Providers**: Runway ML, Pika Labs
3. **Add More Audio Providers**: ElevenLabs, OpenAI TTS, Suno
4. **Implement Pricing**: Add cost tracking for all new providers
5. **Add Provider Health Checks**: Monitor availability and latency
6. **Create Integration Tests**: End-to-end tests for each capability

---

## 📝 Notes

`★ Insight ─────────────────────────────────────`
**Multi-Modal Architecture**: The executor system now supports four modalities (text, image, video, audio) through a unified capability-based resolution system. Each capability has its own IR format and executor registry, allowing providers to specialize in their strengths while maintaining a consistent API surface for clients.

**Provider Flexibility**: The OpenAI-compatible executor pattern allows rapid onboarding of new text providers (14 added in this update) with minimal code - just a simple wrapper pointing to the shared executor logic. Only providers with special quirks (like Xiaomi's `chat_template_kwargs` or DeepSeek's `reasoning_content`) need custom handling.

**Fal Integration**: Fal.ai provides access to 600+ models across three modalities through a single unified API, making it an ideal foundation for image/video/audio generation capabilities. The executor design allows easy expansion to other providers (Runway, Stability, etc.) following the same pattern.
`─────────────────────────────────────────────────`

