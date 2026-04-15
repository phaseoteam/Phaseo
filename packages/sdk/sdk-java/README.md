# AI Stats Java SDK

Official Java SDK for AI Stats Gateway.

Maven coordinates:

- Group ID: `app.phaseo`
- Artifact ID: `ai-stats-sdk`

## Installation

```xml
<dependency>
  <groupId>app.phaseo</groupId>
  <artifactId>ai-stats-sdk</artifactId>
  <version>1.1.2</version>
</dependency>
```

If you are building from this repository instead:

```bash
pnpm --filter @ai-stats/java-sdk run build
```

## Quick start

```java
import ai.stats.sdk.AIStats;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        String baseUrl = System.getenv("AI_STATS_BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://api.phaseo.app/v1";
        }

        AIStats client = new AIStats(apiKey, baseUrl);

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", "google/gemma-3-27b:free");
        payload.put("input", "Reply with: Java SDK works");

        JsonNode response = client.createResponse(payload);
        System.out.println(response.get("id"));
    }
}
```

## Common methods

- `createResponse(request)`
- `createChatCompletion(request)`
- `listModels(query)`
- `getModelDeprecationInfo(modelId)`
- `validateModel(modelId)`

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:java`
- Build: `pnpm --filter @ai-stats/java-sdk run build`
- Test: `pnpm --filter @ai-stats/java-sdk run test`
