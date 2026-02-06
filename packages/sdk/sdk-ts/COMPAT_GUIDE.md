# SDK Compatibility Guide 🔄

The AI Stats SDK provides **drop-in replacement** compatibility layers for both OpenAI and Anthropic SDKs, allowing you to switch providers with minimal code changes while accessing 400+ AI models.

## Why Use AI Stats SDK?

✅ **Drop-in replacement** - Use the same API as OpenAI/Anthropic SDKs
✅ **400+ models** - Access models from OpenAI, Anthropic, Google, Meta, and more
✅ **Unified pricing** - One billing system across all providers
✅ **Built-in telemetry** - Track usage and performance automatically
✅ **Native features** - Access AI Stats-specific features via `.native` property

---

## OpenAI SDK Compatibility

### Installation

```bash
npm install @ai-stats/sdk
# or
pnpm add @ai-stats/sdk
```

### Drop-in Replacement

Replace this:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

With this:

```typescript
import { OpenAI } from '@ai-stats/sdk/compat/openai';

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY  // Get your key at ai-stats.app
});

const completion = await client.chat.completions.create({
  model: 'openai/gpt-4o',  // Prefix with provider
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| `chat.completions.create()` | ✅ | Streaming and non-streaming |
| `images.generate()` | ✅ | DALL-E and other image models |
| `audio.speech.create()` | ✅ | Text-to-speech |
| `audio.transcriptions.create()` | ✅ | Whisper and alternatives |
| `audio.translations.create()` | ✅ | Audio translation |
| `moderations.create()` | ✅ | Content moderation |
| `models.list()` | ✅ | List available models |
| `files.create()` | ✅ | File uploads |
| `files.retrieve()` | ✅ | File retrieval |
| `files.list()` | ✅ | List files |
| `batches.create()` | ✅ | Batch processing |
| `batches.retrieve()` | ✅ | Batch status |

### Streaming Example

```typescript
import { OpenAI } from '@ai-stats/sdk/compat/openai';

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY
});

const stream = await client.chat.completions.create({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Access Native Features

The AI Stats SDK has features not available in the OpenAI SDK. Access them via `.native`:

```typescript
import { OpenAI } from '@ai-stats/sdk/compat/openai';

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: 'https://gateway.ai-stats.app/v1'
});

// OpenAI-compatible API
const completion = await client.chat.completions.create({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Access AI Stats-specific features
const analytics = await client.native.getAnalytics({
  timeRange: 'week'
});

const generation = await client.native.getGeneration('gen_123');
```

---

## Anthropic SDK Compatibility

### Drop-in Replacement

Replace this:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }]
});
```

With this:

```typescript
import { Anthropic } from '@ai-stats/sdk/compat/anthropic';

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY
});

const message = await client.messages.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',  // Prefix with provider
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }]
});
```

### Message Format Conversion

The Anthropic compatibility layer automatically converts between Anthropic's message format and OpenAI's chat format:

```typescript
import { Anthropic } from '@ai-stats/sdk/compat/anthropic';

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY
});

// Use Anthropic's native format
const message = await client.messages.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  system: 'You are a helpful assistant.',  // System message (Anthropic style)
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: '...'
          }
        }
      ]
    }
  ]
});

console.log(message.content[0].text);  // Response in Anthropic format
```

### Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| `messages.create()` | ✅ | Non-streaming |
| `messages.create({ stream: true })` | ✅ | Streaming |
| System messages | ✅ | Converted to OpenAI format |
| Content blocks | ✅ | Text and image blocks |
| max_tokens | ✅ | Required parameter |
| temperature | ✅ | Optional parameter |
| top_p | ✅ | Optional parameter |
| top_k | ✅ | Optional parameter (Anthropic-specific) |
| stop_sequences | ✅ | Converted to OpenAI `stop` |

### Streaming Example

```typescript
import { Anthropic } from '@ai-stats/sdk/compat/anthropic';

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY
});

const stream = await client.messages.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Response Format

Responses match the Anthropic SDK format:

```typescript
{
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello! How can I help you?' }],
  model: 'anthropic/claude-3-5-sonnet-20241022',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 25
  }
}
```

---

## Model Naming Convention

AI Stats uses a provider-prefixed naming convention:

| SDK | AI Stats Equivalent |
|-----|---------------------|
| `gpt-4o` | `openai/gpt-4o` |
| `gpt-4o-mini` | `openai/gpt-4o-mini` |
| `claude-3-5-sonnet-20241022` | `anthropic/claude-3-5-sonnet-20241022` |
| `gemini-2.0-flash` | `google-ai-studio/gemini-2.0-flash` |
| `llama-3.3-70b` | `meta/llama-3.3-70b` |

Browse all 400+ models at [ai-stats.app/models](https://ai-stats.app/models)

---

## Configuration Options

### OpenAI Compatibility

```typescript
import { OpenAI } from '@ai-stats/sdk/compat/openai';

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,           // Required
  baseURL: 'https://gateway.ai-stats.app/v1',     // Optional (default)
  timeout: 60000,                                 // Optional (60s default)
  dangerouslyAllowBrowser: false,                 // Optional
  defaultHeaders: {                               // Optional
    'X-Custom-Header': 'value'
  }
});
```

### Anthropic Compatibility

```typescript
import { Anthropic } from '@ai-stats/sdk/compat/anthropic';

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY,           // Required
  baseURL: 'https://gateway.ai-stats.app/v1',     // Optional (default)
  timeout: 60000,                                 // Optional (60s default)
  maxRetries: 3,                                  // Optional
  defaultHeaders: {                               // Optional
    'X-Custom-Header': 'value'
  }
});
```

---

## Migration Checklist

Migrating from OpenAI or Anthropic? Here's your checklist:

### From OpenAI SDK

- [ ] Replace `import OpenAI from 'openai'` with `import { OpenAI } from '@ai-stats/sdk/compat/openai'`
- [ ] Update API key from `OPENAI_API_KEY` to `AI_STATS_API_KEY`
- [ ] Prefix model names with `openai/` (e.g., `gpt-4o` → `openai/gpt-4o`)
- [ ] Optional: Update `baseURL` if using custom gateway URL
- [ ] Test existing code - it should work without other changes!

### From Anthropic SDK

- [ ] Replace `import Anthropic from '@anthropic-ai/sdk'` with `import { Anthropic } from '@ai-stats/sdk/compat/anthropic'`
- [ ] Update API key from `ANTHROPIC_API_KEY` to `AI_STATS_API_KEY`
- [ ] Prefix model names with `anthropic/` (e.g., `claude-3-5-sonnet-20241022` → `anthropic/claude-3-5-sonnet-20241022`)
- [ ] Optional: Update `baseURL` if using custom gateway URL
- [ ] Test existing code - message format conversion is automatic!

---

## Native AI Stats SDK

Want to use the native AI Stats SDK instead of compatibility layers?

```typescript
import { AIStats } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  baseUrl: 'https://gateway.ai-stats.app/v1',
  devtools: {
    enabled: true,  // Enable built-in devtools
    endpoint: 'http://localhost:3001'
  }
});

// Generate text
const response = await client.generateText({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Stream text
for await (const chunk of client.streamText({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }]
})) {
  process.stdout.write(chunk);
}

// Generate images
const image = await client.generateImage({
  model: 'openai/dall-e-3',
  prompt: 'A sunset over mountains',
  size: '1024x1024'
});

// Get analytics
const analytics = await client.getAnalytics({
  timeRange: 'week'
});
```

---

## Environment Variables

Create a `.env` file:

```bash
# AI Stats Gateway API Key (get yours at ai-stats.app)
AI_STATS_API_KEY=your-api-key-here

# Optional: Custom gateway URL (defaults to https://gateway.ai-stats.app/v1)
AI_STATS_BASE_URL=https://gateway.ai-stats.app/v1
```

---

## Getting Your API Key

1. Sign up at [ai-stats.app](https://ai-stats.app)
2. Navigate to **Settings → API Keys**
3. Click **Create API Key**
4. Copy your key to `.env` as `AI_STATS_API_KEY`

---

## FAQ

### Q: Will my existing code work without changes?

**A:** Almost! The only changes needed are:
1. Update the import statement
2. Change the API key environment variable
3. Prefix model names with the provider (e.g., `openai/gpt-4o`)

### Q: Do I need to change my message format?

**A:** No! The compatibility layers handle format conversion automatically.

### Q: Can I access AI Stats-specific features?

**A:** Yes! Use the `.native` property to access the underlying AIStats client:

```typescript
const openai = new OpenAI({ apiKey: '...' });
const analytics = await openai.native.getAnalytics();
```

### Q: What about streaming?

**A:** Streaming works exactly like the official SDKs - just set `stream: true`.

### Q: Are all OpenAI/Anthropic features supported?

**A:** Most features are supported. See the feature tables above for details.

### Q: How do I list available models?

**A:** Use `client.models.list()` (OpenAI compat) or visit [ai-stats.app/models](https://ai-stats.app/models)

### Q: What about pricing?

**A:** AI Stats uses unified pricing across all providers. View pricing at [ai-stats.app/pricing](https://ai-stats.app/pricing)

---

## Support

- 📖 **Documentation**: [ai-stats.app/docs](https://ai-stats.app/docs)
- 💬 **Discord**: [Join our community](https://discord.gg/ai-stats)
- 🐛 **Issues**: [GitHub Issues](https://github.com/AI-Stats/AI-Stats/issues)
- 📧 **Email**: support@ai-stats.app

---

## License

MIT - See [LICENSE](../../LICENSE) for details
