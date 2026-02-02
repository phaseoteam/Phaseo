# Provider Integration Tests

Comprehensive test suites for each provider across all supported protocols and features.

## Structure

```
tests/providers/
├── helpers/
│   └── provider-test-suite.ts    # Shared utilities for all provider tests
├── openai/
│   ├── chat-completions.spec.ts  # Chat Completions API tests
│   └── responses-api.spec.ts     # Responses API tests
├── z-ai/
│   └── chat-completions.spec.ts  # Z.AI (GLM) Chat Completions tests
└── README.md                      # This file
```

## Test Coverage Matrix

Each provider should be tested across these dimensions:

### Protocols (Executors)
1. **Chat Completions** (`/v1/chat/completions`)
2. **Responses API** (`/v1/responses`)
3. **Anthropic Messages** (`/v1/messages`) - if supported

### Features per Protocol
1. **Text Input**
   - Basic text request
   - System messages
   - Multi-turn conversations
   - Temperature/max_tokens parameters

2. **Vision (Image Input)**
   - Image URL
   - Base64 encoded images
   - Detail parameter (low/high)
   - Multiple images

3. **File Inputs** (if supported)
   - PDF via URL
   - PDF via base64
   - Audio files

4. **Tools (Function Calling)**
   - Tool definitions
   - Forced tool calls (`tool_choice`)
   - Tool result continuation
   - Parallel tool calls

5. **Reasoning**
   - Reasoning effort levels
   - `reasoning_content` format
   - `reasoning_details` format (OpenRouter-compatible)
   - Reasoning in multi-turn conversations

6. **Streaming**
   - Basic streaming
   - Streaming with tools
   - Streaming with reasoning
   - Usage accumulation in final chunk

7. **Response Format**
   - JSON object mode
   - JSON schema mode (strict)

8. **Edge Cases**
   - Empty messages
   - Very long context
   - Multiple choices (`n` parameter)
   - Error handling

## Adding a New Provider

### Step 1: Create Provider Directory

```bash
mkdir -p tests/providers/{provider-name}
```

### Step 2: Define Provider Config

Create a test file with the provider configuration:

```typescript
import { ProviderTestConfig } from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "your-provider",
	baseModel: "your-provider/model-name",
	capabilities: {
		chatCompletions: true,
		responsesApi: false,
		anthropicMessages: false,
		streaming: true,
		tools: true,
		reasoning: false,
		vision: true,
		audio: false,
		pdfInput: false,
	},
};
```

### Step 3: Copy Template Tests

Copy the relevant test files from `openai/` and adapt them:

1. **Always test Chat Completions** - this is the most common protocol
2. **Test Responses API** - if the provider supports it
3. **Test Anthropic Messages** - if the provider supports it

### Step 4: Customize Tests

Modify tests based on provider capabilities:

- Remove tests for unsupported features (e.g., remove vision tests if `vision: false`)
- Add provider-specific tests (e.g., Z.AI thinking mode activation)
- Adjust expectations based on provider behavior

### Step 5: Run Tests

```bash
# Run all provider tests
npm test tests/providers/

# Run specific provider
npm test tests/providers/openai/

# Run specific protocol
npm test tests/providers/openai/chat-completions.spec.ts
```

## Provider-Specific Considerations

### OpenAI
- Supports all three protocols (Chat, Responses, Messages)
- Full reasoning support via `reasoning: { effort }` parameter
- Full vision support (URL + base64, detail parameter)
- JSON schema with strict mode

### Z.AI (GLM)
- Chat Completions and Responses API
- **Reasoning via thinking mode**: Activated when `reasoning.effort !== "none"`
- Returns `reasoning_content` in responses
- Vision support for images
- Tool calling support

### Anthropic
- Messages protocol is primary
- Chat Completions via adapter
- Extended thinking with `thinking` blocks
- Vision support
- Tool use (different format than OpenAI)

### MiniMax
- OpenAI-compatible with custom `reasoning_content` field
- Returns reasoning in `message.reasoning_content`
- Tool calling support

## Test Utilities

### `runProtocol()`
Execute a request against the gateway:

```typescript
const response = await runProtocol(CONFIG, "/chat/completions", {
	model: CONFIG.baseModel,
	messages: [{ role: "user", content: "Hello" }],
});
```

### `expectUsageTokens()`
Verify usage tracking and accumulate cost:

```typescript
expectUsageTokens(response, context);
```

### `expectStreamFrames()`
Verify streaming response format:

```typescript
const result = await runProtocol(CONFIG, "/chat/completions", {
	model: CONFIG.baseModel,
	messages: [{ role: "user", content: "Hello" }],
}, { stream: true });

expectStreamFrames(result.frames, context);
```

### `printTestSummary()`
Print total tokens and cost after all tests:

```typescript
afterAll(() => {
	printTestSummary(context, "Provider Name");
});
```

## Running Tests in CI/CD

These tests are designed to run against a live gateway. Configure in CI:

```yaml
env:
  GATEWAY_URL: https://gateway.example.com/v1
  GATEWAY_API_KEY: ${{ secrets.GATEWAY_API_KEY }}

test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - run: npm test tests/providers/
```

## Cost Tracking

Each test suite tracks:
- Total tokens used
- Total cost (if gateway returns pricing info)

This helps monitor test costs and identify expensive test scenarios.

## Best Practices

1. **Test Real Behavior**: These are integration tests - they hit real provider APIs
2. **Keep Tests Fast**: Use short prompts and small contexts when possible
3. **Be Provider-Aware**: Customize expectations based on provider quirks
4. **Document Differences**: Add comments explaining provider-specific behavior
5. **Track Costs**: Monitor test suite costs and optimize expensive tests

## Example Test

```typescript
describe("Text Input", () => {
	it("should handle basic text request", async () => {
		const response: any = await runProtocol(CONFIG, "/chat/completions", {
			model: CONFIG.baseModel,
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
		});

		expect(response.id).toBeDefined();
		expect(response.object).toBe("chat.completion");
		expect(response.choices[0].message.content).toBeDefined();
		expectUsageTokens(response, context);
	});
});
```

## Debugging Failed Tests

1. **Check Gateway URL**: Ensure `GATEWAY_URL` is set correctly
2. **Verify API Key**: Ensure `GATEWAY_API_KEY` has access to the provider
3. **Check Provider Status**: Provider APIs may be down or rate-limited
4. **Review Provider Quirks**: Some providers return different formats
5. **Check Logs**: Gateway logs will show the actual provider request/response

## Future Improvements

- [ ] Add automatic test generation from OpenAPI specs
- [ ] Add performance benchmarking (latency, throughput)
- [ ] Add cost optimization recommendations
- [ ] Add test coverage reporting per provider
- [ ] Add provider compatibility matrix visualization
