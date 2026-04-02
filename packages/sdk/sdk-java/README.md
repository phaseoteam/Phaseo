# AI Stats Java SDK

Generated from the AI Stats Gateway OpenAPI spec with:

- High-level wrapper: `ai.stats.sdk.AIStats`
- Full generated surface: `ai.stats.gen.Operations`

Maven coordinates:

- Group: `app.phaseo`
- Artifact: `ai-stats-sdk`

Usage:

```java
// Uses AI_STATS_API_KEY from environment by default.
var client = new ai.stats.sdk.AIStats();
var response = client.createResponse(Map.of(
  "model", "openai/gpt-5.4",
  "input", "Write a one-sentence bedtime story about a unicorn."
));
System.out.println(response);
```

Generate with `pnpm openapi:gen:java`.
