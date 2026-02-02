# Parameter Configuration Schema (Simplified)

## Overview

The `params` JSONB field in `data_api_provider_model_capabilities` defines what parameters each provider-model-capability combination supports.

**Simple Rule:** If a parameter key exists in `params`, it's supported. If it's missing, it's not supported.

## Structure

```json
{
  "temperature": {},              // Supported (empty object = supported with no special config)
  "tools": {},                    // Supported
  "max_tokens": {},               // Supported
  "reasoning": {                  // Supported with conversion metadata
    "style": "effort",            // "effort" or "tokens"
    "maxReasoningTokens": 32768   // For conversion between effort and tokens
  },
  "response_format": {            // Supported with additional config
    "types": ["text", "json_object", "json_schema"],
    "structuredOutputs": true
  }
  // Parameters not listed are NOT supported
}
```

---

## Parameter Catalog

### Core Generation Parameters

**Supported by most providers:**
- `max_tokens` - Maximum output tokens (normalizes to provider's `max_output_tokens`)
- `temperature` - Randomness (0-1 for Anthropic, 0-2 for OpenAI)
- `top_p` - Nucleus sampling
- `top_k` - Top-K sampling
- `min_p` - Minimum probability threshold
- `top_a` - Top-A sampling

### Penalty Parameters

- `presence_penalty` - Penalize repeated tokens
- `frequency_penalty` - Penalize frequent tokens
- `repetition_penalty` - Alternative penalty method

### Reasoning Parameters

- `reasoning` - **Special config required** (see below)
- `include_reasoning` - Flag to include reasoning in response
- `reasoning_effort` - Top-level effort parameter (some providers)
- `verbosity` - MiniMax-style reasoning verbosity (0-3)

### Response Formatting

- `response_format` - **Special config optional** (see below)
- `structured_outputs` - Strict JSON schemas

### Tool Calling

- `tools` - Function calling support
- `tool_choice` - Control tool selection

### Advanced

- `stop` - Stop sequences
- `logprobs` - Token probabilities
- `top_logprobs` - Number of top logprobs
- `seed` - Deterministic generation
- `logit_bias` - Token bias
- `web_search_options` - Web search (Cohere)

---

## Special Configurations

### `reasoning`

If present, provider supports reasoning. The value provides conversion metadata:

```json
{
  "reasoning": {
    "style": "effort",              // "effort" (o1) or "tokens" (Claude Extended Thinking)
    "maxReasoningTokens": 32768     // Maximum reasoning budget (for conversion)
  }
}
```

**Conversion:**
- **Effort → Tokens:** `tokens = maxReasoningTokens × effort_percent`
- **Tokens → Effort:** Find closest effort level

| Effort  | Percentage |
|---------|------------|
| none    | 0%         |
| minimal | 15%        |
| low     | 30%        |
| medium  | 50%        |
| high    | 75%        |
| xhigh   | 90%        |

### `response_format`

If present, provider supports response formatting:

```json
{
  "response_format": {
    "types": ["text", "json_object", "json_schema"],  // Optional: allowed types
    "structuredOutputs": true                         // Optional: strict schemas
  }
}
```

If `types` is omitted, all types are assumed supported.

---

## Complete Examples

### OpenAI GPT-4o
```json
{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "presence_penalty": {},
  "frequency_penalty": {},
  "logit_bias": {},
  "seed": {},
  "stop": {},
  "tools": {},
  "tool_choice": {},
  "response_format": {
    "types": ["text", "json_object", "json_schema"],
    "structuredOutputs": true
  },
  "logprobs": {},
  "top_logprobs": {}
}
```

### OpenAI o1
```json
{
  "max_tokens": {},
  "reasoning": {
    "style": "effort",
    "maxReasoningTokens": 32768
  }
}
```
*Note: o1 doesn't support temperature, tools, response_format - so they're omitted*

### Anthropic Claude 3.5 Sonnet
```json
{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "top_k": {},
  "stop": {},
  "tools": {},
  "tool_choice": {},
  "reasoning": {
    "style": "tokens",
    "maxReasoningTokens": 10000
  }
}
```

### Google Gemini 2.5 Flash
```json
{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "top_k": {},
  "stop": {},
  "tools": {},
  "tool_choice": {},
  "response_format": {
    "types": ["text", "json_object"]
  }
}
```

### Cohere Command R+
```json
{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "top_k": {},
  "presence_penalty": {},
  "frequency_penalty": {},
  "stop": {},
  "tools": {},
  "tool_choice": {},
  "web_search_options": {}
}
```

### MiniMax abab6.5
```json
{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "tools": {},
  "tool_choice": {},
  "verbosity": {}
}
```

---

## Normalization Rules

### Temperature

**Based on endpoint/protocol:**
- **Anthropic endpoint** (`/v1/messages`): Range 0-1
- **OpenAI endpoint** (`/v1/chat/completions`, `/v1/responses`): Range 0-2

**Automatic scaling:**
- Request to Anthropic endpoint with `temperature: 1.5` → scaled to 0.75 (1.5 / 2 × 1)
- Request to OpenAI endpoint with `temperature: 0.5` from Anthropic protocol → scaled to 1.0 (0.5 / 1 × 2)

### Max Tokens

**Uses database `max_output_tokens` field:**
- Providers validated against requested `max_tokens`
- If omitted and routing to Anthropic, uses provider's `max_output_tokens` as default
- OpenAI providers allow omitting `max_tokens`

### Reasoning

**Automatic conversion based on provider style:**

**Example 1: Effort → Tokens**
```
User requests: reasoning.effort = "high"
Provider style: "tokens"
Provider maxReasoningTokens: 10000
Result: reasoning.maxTokens = 7500 (75% × 10000)
```

**Example 2: Tokens → Effort**
```
User requests: reasoning.maxTokens = 24576
Provider style: "effort"
Provider maxReasoningTokens: 32768
Result: reasoning.effort = "high" (24576 / 32768 ≈ 75%)
```

---

## Error Handling

### User requests unsupported parameter

```bash
POST /v1/chat/completions
{
  "model": "o1",
  "tools": [{...}],  # o1 doesn't support tools
  "messages": [...]
}

# Response:
{
  "error": {
    "message": "No provider supports parameter: tools",
    "type": "validation_error",
    "code": "unsupported_param"
  }
}
```

### User requests unsupported response format type

```bash
POST /v1/chat/completions
{
  "model": "claude-3-5-sonnet",
  "response_format": {"type": "json_schema"},  # Claude doesn't support json_schema
  "messages": [...]
}

# Response:
{
  "error": {
    "message": "No provider supports response_format type: json_schema",
    "type": "validation_error",
    "code": "unsupported_response_format"
  }
}
```

### User requests reasoning on non-reasoning model

```bash
POST /v1/chat/completions
{
  "model": "gpt-4o",
  "reasoning": {"effort": "high"},  # GPT-4o doesn't support reasoning
  "messages": [...]
}

# Response:
{
  "error": {
    "message": "No provider supports the requested reasoning configuration (effort: high)",
    "type": "validation_error",
    "code": "unsupported_reasoning"
  }
}
```

---

## Database Migration

```sql
-- OpenAI GPT-4o
UPDATE data_api_provider_model_capabilities
SET params = '{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "tools": {},
  "response_format": {"types": ["text", "json_object", "json_schema"], "structuredOutputs": true}
}'::jsonb
WHERE provider_api_model_id = 'openai:gpt-4o'
  AND capability_id = 'text.generate';

-- OpenAI o1
UPDATE data_api_provider_model_capabilities
SET params = '{
  "max_tokens": {},
  "reasoning": {"style": "effort", "maxReasoningTokens": 32768}
}'::jsonb
WHERE provider_api_model_id = 'openai:o1'
  AND capability_id = 'text.generate';

-- Anthropic Claude 3.5 Sonnet
UPDATE data_api_provider_model_capabilities
SET params = '{
  "max_tokens": {},
  "temperature": {},
  "top_p": {},
  "top_k": {},
  "tools": {},
  "reasoning": {"style": "tokens", "maxReasoningTokens": 10000}
}'::jsonb
WHERE provider_api_model_id = 'anthropic:claude-3-5-sonnet-20241022'
  AND capability_id = 'text.generate';
```

---

## Usage Flow

### 1. Request Arrives
```json
{
  "model": "claude-3-5-sonnet",
  "temperature": 1.5,
  "tools": [{...}],
  "reasoning": {"effort": "high"},
  "messages": [...]
}
```

### 2. Parameter Extraction
Gateway extracts: `temperature`, `tools`, `reasoning`

### 3. Provider Filtering
- Check each provider's `params` JSONB
- Filter out providers missing any of: `temperature`, `tools`, `reasoning`
- Result: Only providers with all three keys remain

### 4. Normalization (in execute phase)
- **Temperature:** 1.5 → 0.75 (OpenAI range → Anthropic range)
- **Reasoning:** effort "high" → maxTokens 7500 (effort → tokens for Anthropic)

### 5. Upstream Request
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.75,
  "tools": [{...}],
  "thinking": {"type": "enabled", "budget_tokens": 7500},
  "messages": [...]
}
```

---

## Testing

### Test 1: Basic Parameter Support
```bash
# Request with tools to model without tools support
curl -X POST /v1/chat/completions \
  -d '{"model": "o1", "tools": [...], "messages": [...]}'

# Expected: Error "No provider supports parameter: tools"
```

### Test 2: Temperature Normalization
```bash
# OpenAI endpoint with temperature 1.5 to Anthropic model
curl -X POST /v1/chat/completions \
  -d '{"model": "claude-3-5-sonnet", "temperature": 1.5, "messages": [...]}'

# Expected: Upstream gets temperature: 0.75
```

### Test 3: Reasoning Conversion
```bash
# Effort to token-based provider
curl -X POST /v1/chat/completions \
  -d '{"model": "claude-3-5-sonnet", "reasoning": {"effort": "high"}, "messages": [...]}'

# Expected: Upstream gets thinking: {type: "enabled", budget_tokens: 7500}
```

---

## Key Principles

✅ **Key exists = Supported**
✅ **Key missing = Not supported**
✅ **User requests unsupported param = Error**
✅ **Normalization happens in execute phase**
✅ **Database is source of truth**
