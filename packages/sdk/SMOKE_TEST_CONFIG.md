# Smoke Test Configuration 🧪

All SDK smoke tests use a centralized configuration to ensure consistency across languages.

## Configuration File

**Location**: `packages/sdk/smoke-manifest.json`

This file defines:
- Test model (gpt-5-nano)
- API endpoints to test
- Expected responses
- Validation rules

## Test Model: `gpt-5-nano`

All smoke tests use `openai/gpt-5-nano` because:

✅ **Text generation only** - No images, audio, or other modalities
✅ **Lowest cost** - Cheapest model for testing
✅ **Fast responses** - Quick feedback during development
✅ **Consistent** - Same model across all SDK languages

## Manifest Structure

```json
{
  "testModel": "openai/gpt-5-nano",
  "operations": {
    "chat": {
      "description": "Text generation test with gpt-5-nano",
      "body": {
        "model": "openai/gpt-5-nano",
        "messages": [
          {
            "role": "user",
            "content": "Say 'test passed' and nothing else"
          }
        ],
        "max_tokens": 10,
        "temperature": 0
      }
    }
  },
  "constraints": {
    "onlyTextGeneration": true,
    "requiredModel": "gpt-5-nano",
    "maxTokens": 100
  }
}
```

## SDK Implementation Status

| SDK | Uses Manifest | Model | Status |
|-----|---------------|-------|--------|
| TypeScript | ✅ Yes | gpt-5-nano | ✅ |
| Python | ✅ Yes | gpt-5-nano | ✅ |
| Go | ✅ Yes | gpt-5-nano | ✅ |
| Rust | ⚠️ Hardcoded | gpt-5-nano | ✅ |
| C# | ⏳ TBD | gpt-5-nano | ⏳ |
| Java | ⏳ TBD | gpt-5-nano | ⏳ |
| PHP | ⏳ TBD | gpt-5-nano | ⏳ |
| Ruby | ⏳ TBD | gpt-5-nano | ⏳ |

## Test Validation

Each test validates:

1. **Request succeeds** (200 status code)
2. **Response has `choices` array**
3. **Response has message content**
4. **No errors in response**

Example expected response:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "test passed"
      }
    }
  ]
}
```

## Environment Variables

Tests use these environment variables:

```bash
# Required
AI_STATS_API_KEY=your-api-key-here

# Optional (defaults to production)
AI_STATS_BASE_URL=https://gateway.ai-stats.app
```

## Modifying Test Configuration

To change the test model or parameters, edit `packages/sdk/smoke-manifest.json`:

```json
{
  "operations": {
    "chat": {
      "body": {
        "model": "openai/gpt-5-nano",  // Change model here
        "max_tokens": 10,               // Adjust token limit
        "temperature": 0                // Control randomness
      }
    }
  }
}
```

**⚠️ Important**: Always use `gpt-5-nano` for smoke tests to keep costs low and tests fast!

## Test Assertions

All smoke tests verify:

### ✅ Required Checks
- API responds (not timeout)
- Status code is 200
- Response is valid JSON
- `choices` array exists and is not empty
- `choices[0].message.content` exists

### ⚠️ Optional Checks
- Response time < 30 seconds
- Token usage is reasonable (<100 tokens)
- No rate limit errors

## Cost Optimization

Using `gpt-5-nano` for all smoke tests:

```
Cost per test: ~$0.0001 (estimated)
Tests per day: ~100 runs
Daily cost: ~$0.01

Monthly cost: ~$0.30 for all SDK testing
```

Compare to using `gpt-4o`:
```
Cost per test: ~$0.001
Monthly cost: ~$3.00 (10x more expensive!)
```

## Troubleshooting

### Test fails with "Invalid model"
- Check that `gpt-5-nano` is available in your gateway
- Verify model name is exactly `openai/gpt-5-nano`
- Confirm your API key has access to the model

### Test timeout
- Check your network connection
- Verify `AI_STATS_BASE_URL` is correct
- Increase timeout in manifest (currently 30s)

### Response validation fails
- Check the response structure matches expected format
- Verify `choices` array exists
- Confirm `message.content` is present

## Future Enhancements

Planned improvements:
- [ ] Add streaming test (still text-only)
- [ ] Add rate limit handling test
- [ ] Add retry logic test
- [ ] Add concurrent request test
- [ ] Performance benchmarking (throughput)

All future tests will continue to use `gpt-5-nano` for text generation only.
