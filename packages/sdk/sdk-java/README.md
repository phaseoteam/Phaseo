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
- `listOrganisations(query)` for paginated `/organisations` discovery
- `listPricingModels(query)` for `/pricing/models` catalogue pricing discovery
- `calculatePricing(request)` for `/pricing/calculate` usage estimation
- `listProviders(query)`, `getCredits(query)`, `getActivity(query)`, and `getAnalytics(query)` for provider discovery and management-key usage surfaces
- `listApiKeys(query)` for management-key `/keys` discovery
- `createApiKey(request)`, `updateApiKey(id, request)`, and `deleteApiKey(id)` for management-key API-key lifecycle changes
- `getApiKey(id)` for management-key `/keys/{id}` lookup
- `listWorkspaces(query)`, `getWorkspace(id)`, `createWorkspace(body)`, `updateWorkspace(id, body)`, and `deleteWorkspace(id)` for management-key workspace lifecycle management
- `getCurrentApiKey()`
- `healthz()`
- `getModelDeprecationInfo(modelId)`
- `validateModel(modelId)`

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability=all` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability=all` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```java
Map<String, String> query = new HashMap<>();
query.put("provider", "anthropic");
query.put("provider_status", "beta,not_ready");
query.put("provider_availability_reason", "preview_only,provider_not_ready");
query.put("capability_status", "coming_soon,internal_testing");
query.put("availability", "all");

JsonNode models = client.listModels(query);
System.out.println(models);
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.

```java
String batchSocketUrl = client.getBatchWebSocketUrl("batch_123", 1500, null);
String videoSocketUrl = client.getVideoWebSocketUrl("video_123", null, true);
String genericSocketUrl = client.getAsyncJobWebSocketUrl("video", "video_123");
String resourceSocketUrl = client.asyncJobs.websocketUrl("video", "video_123");

System.out.println(batchSocketUrl);
System.out.println(videoSocketUrl);
System.out.println(genericSocketUrl);
System.out.println(resourceSocketUrl);
```

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
