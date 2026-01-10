# SDK Compatibility Tests

These tests verify that the AI Stats Gateway is fully compatible with official SDKs from OpenAI and Anthropic by simply changing the base URL.

## Overview

The gateway implements protocol-compliant APIs that work seamlessly with:
- **OpenAI SDK** - Chat Completions and Responses API
- **Anthropic SDK** - Messages API

Users can point official SDKs at the gateway without code changes (just update base URL and API key).

## Prerequisites

### 1. Install Dependencies

```bash
cd apps/api
pnpm install openai @anthropic-ai/sdk --save-dev
```

### 2. Start the Gateway

```bash
# In one terminal
pnpm --filter @ai-stats/gateway-api dev

# Gateway should be running on http://localhost:8787 (or your configured port)
```

### 3. Set Environment Variables

Create a `.env.test` file in `apps/api/`:

```bash
# Gateway configuration
GATEWAY_BASE_URL=http://localhost:8787
GATEWAY_API_KEY=your_gateway_api_key

# Optional: Provider keys if testing passthrough
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Or export them:

```bash
export GATEWAY_BASE_URL=http://localhost:8787
export GATEWAY_API_KEY=gw_test123
```

## Running Tests

### Run All SDK Tests

```bash
pnpm test tests/sdk
```

### Run OpenAI SDK Tests Only

```bash
pnpm test tests/sdk/openai-sdk-compat
```

### Run Anthropic SDK Tests Only

```bash
pnpm test tests/sdk/anthropic-sdk-compat
```

### Run with Environment Variables Inline

```bash
GATEWAY_BASE_URL=http://localhost:8787 GATEWAY_API_KEY=gw_test pnpm test tests/sdk
```

## Test Coverage

### OpenAI SDK Compatibility

✅ **Chat Completions**:
- Basic message completion
- Streaming responses
- System messages
- Temperature and generation parameters
- Usage statistics
- ID preservation (gateway vs native)

✅ **Tool Calling (Function Calling)**:
- Tool definitions
- Tool invocation
- Multi-turn conversations with tool results

✅ **Responses API**:
- Basic response creation
- Gateway ID as primary identifier
- HTTP-level compatibility

✅ **Error Handling**:
- Invalid models
- Authentication errors

### Anthropic SDK Compatibility

✅ **Messages API**:
- Basic message creation
- Streaming responses
- System messages
- Temperature and generation parameters
- Usage statistics
- Stop sequences
- Gateway metadata (`_gateway` field)

✅ **Tool Use**:
- Tool definitions
- Tool invocation
- Multi-turn conversations with tool results

✅ **Multimodal Content**:
- Text content blocks
- Content array handling

✅ **Conversation Context**:
- Multi-turn conversations
- Context preservation

✅ **Gateway Extensions**:
- `_gateway` metadata field
- Spec compliance (no top-level `nativeResponseId`)

## What These Tests Verify

### 1. Protocol Compliance

The tests ensure that:
- Gateway responses match official API specifications
- Response formats are valid for each SDK
- All required fields are present
- Optional fields are handled correctly

### 2. ID Handling

The tests verify:
- Gateway uses its own request ID as primary `id`
- Native provider IDs are preserved separately
- IDs are consistent across streaming chunks
- ID format matches gateway conventions (`req_*`)

### 3. Feature Parity

The tests confirm:
- All SDK features work through the gateway
- Tool calling/function calling works end-to-end
- Streaming responses are properly formatted
- Usage statistics are accurately reported

### 4. Error Handling

The tests validate:
- Invalid requests return proper errors
- Authentication failures are handled correctly
- SDK error parsing works with gateway errors

## Expected Test Output

### Successful Run

```
✓ tests/sdk/openai-sdk-compat.test.ts (15)
  ✓ OpenAI SDK Compatibility (12)
    ✓ Chat Completions API (6)
      ✓ should handle basic chat completion
      ✓ should preserve nativeResponseId from provider
      ✓ should handle streaming responses
      ✓ should handle system messages
      ✓ should handle temperature and other parameters
      ✓ should include usage statistics
    ✓ Tool Calling (Function Calling) (2)
      ✓ should handle tool definitions
      ✓ should handle tool results in conversation
    ✓ Error Handling (2)
      ✓ should handle invalid model gracefully
      ✓ should handle missing API key
  ✓ OpenAI Responses API SDK Compatibility (2)
    ✓ Responses API (2)
      ✓ should handle basic response creation
      ✓ should use gateway request ID as primary id

✓ tests/sdk/anthropic-sdk-compat.test.ts (18)
  ✓ Anthropic SDK Compatibility (18)
    ✓ Messages API (6)
      ✓ should handle basic message creation
      ✓ should include _gateway metadata with native response ID
      ✓ should handle system messages
      ✓ should handle streaming responses
      ✓ should include usage statistics
      ✓ should handle temperature and other parameters
      ✓ should handle stop sequences
    ✓ Tool Use (Function Calling) (2)
      ✓ should handle tool definitions
      ✓ should handle tool results in conversation
    ✓ Multimodal Content (1)
      ✓ should handle text content
    ✓ Conversation Context (1)
      ✓ should maintain conversation history
    ✓ Error Handling (3)
      ✓ should handle invalid model gracefully
      ✓ should handle missing API key
      ✓ should handle max_tokens exceeding limit
    ✓ Gateway Extensions (2)
      ✓ should NOT expose nativeResponseId at top level
      ✓ should include requestId in _gateway metadata

Test Files  2 passed (2)
     Tests  33 passed (33)
```

### If Environment Not Set

```
⚠️  Skipping OpenAI SDK compatibility tests

To run these tests, set:
  GATEWAY_BASE_URL=http://localhost:8787
  GATEWAY_API_KEY=your_gateway_key
```

## Troubleshooting

### Tests are Skipped

**Cause**: Environment variables not set

**Solution**:
```bash
export GATEWAY_BASE_URL=http://localhost:8787
export GATEWAY_API_KEY=your_key
pnpm test tests/sdk
```

### Connection Refused

**Cause**: Gateway not running

**Solution**:
```bash
# Start gateway in another terminal
pnpm --filter @ai-stats/gateway-api dev
```

### Authentication Errors

**Cause**: Invalid API key

**Solution**:
- Verify your gateway API key is correct
- Check that the key has proper permissions
- Ensure the key is active in your gateway database

### Model Not Found

**Cause**: Model not configured in gateway

**Solution**:
- Verify the model exists in your gateway configuration
- Check `data_api_provider_models` table
- Ensure the model is marked as `is_active_gateway=true`

### Timeout Errors

**Cause**: Provider or gateway slow to respond

**Solution**:
- Increase test timeout (default is usually sufficient)
- Check gateway logs for upstream delays
- Verify provider API keys are valid

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: SDK Compatibility Tests

on: [push, pull_request]

jobs:
  sdk-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Start Gateway
        run: |
          pnpm --filter @ai-stats/gateway-api build
          pnpm --filter @ai-stats/gateway-api preview &
          sleep 5  # Wait for gateway to start

      - name: Run SDK Tests
        env:
          GATEWAY_BASE_URL: http://localhost:8787
          GATEWAY_API_KEY: ${{ secrets.GATEWAY_TEST_KEY }}
        run: pnpm test tests/sdk
```

## Adding New SDK Tests

To add tests for a new SDK or endpoint:

1. Create new test file: `tests/sdk/{provider}-sdk-compat.test.ts`
2. Follow existing patterns for setup and structure
3. Use environment variables for configuration
4. Include skip logic when env vars not set
5. Test both success and error cases
6. Verify ID handling and protocol compliance

Example template:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import SomeSDK from "some-sdk";

const shouldSkip = !process.env.GATEWAY_BASE_URL || !process.env.GATEWAY_API_KEY;
const describeIf = shouldSkip ? describe.skip : describe;

describeIf("Some SDK Compatibility", () => {
  let client: SomeSDK;

  beforeAll(() => {
    client = new SomeSDK({
      baseURL: process.env.GATEWAY_BASE_URL,
      apiKey: process.env.GATEWAY_API_KEY,
    });
  });

  it("should work", async () => {
    // Test implementation
  });
});
```

## Notes

- **These are integration tests**: They require a running gateway instance
- **They make real API calls**: May incur costs if using real provider keys
- **They test protocol compliance**: Not just gateway logic, but SDK compatibility
- **They verify user experience**: Ensures drop-in replacement works as expected

## Related Documentation

- [ID Handling Guide](../../docs/v1/developers/gateway-architecture/id-handling.mdx)
- [Gateway Architecture](../../docs/v1/developers/gateway-architecture/)
- [API Reference](../../docs/v1/api-reference/)
