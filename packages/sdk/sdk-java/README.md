# Phaseo Java SDK

Official Java SDK for Phaseo Gateway.

Maven coordinates:

- Group ID: `app.phaseo`
- Artifact ID: `phaseo-sdk`

## Installation

Requires Java 17+, Maven 3.8+, and Git. Build the current SDK from source to get
retry controls, response metadata, and parameter checks:

```bash
git clone https://github.com/phaseoteam/Phaseo.git
cd Phaseo
git checkout 1ff1119f41ceb3ac2c85ed605f6e1c4beca6e011
mvn -f packages/sdk/sdk-java/pom.xml -DskipTests install
```

Then add the locally installed artifact to your application's `pom.xml`:

```xml
<dependency>
  <groupId>app.phaseo</groupId>
  <artifactId>phaseo-sdk</artifactId>
  <version>3.0.0</version>
</dependency>
```

The older `app.phaseo:phaseo-sdk:3.0.0` artifact is available on Maven Central,
but lacks the current retry, metadata, and parameter-checking APIs. The source
installation above includes Jackson and uses the same Maven coordinates.

## Quick start

```java
import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        String baseUrl = System.getenv("PHASEO_BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://api.phaseo.app/v1";
        }

        Phaseo client = new Phaseo(apiKey, baseUrl);

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", "google/gemma-3-27b:free");
        payload.put("input", "Reply with: Java SDK works");

        JsonNode response = client.createResponse(payload);
        System.out.println(response.get("id"));
    }
}
```

## Common methods

Pass a `Map` or `JsonNode` to JSON request helpers. A Java `String` is serialized
as a JSON string; use `new ObjectMapper().readTree(body)` for existing JSON text.

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

Use `getModelEndpointCapabilities` for live provider routes, or `checkModelParameters` to highlight unsupported, partially supported, unknown, and out-of-range values before submitting a request.

```java
JsonNode report = client.checkModelParameters("openai/gpt-5.4", Map.of("temperature", 0.7), Map.of("endpoint", "responses"));
JsonNode preflight = client.preflightRequest(Map.of("model", "openai/gpt-5.4", "input", "Hello", "temperature", 0.7), Map.of("endpoint", "responses"));
```

`Workflows.PageIterator<T>` provides lazy offset pagination, and
`Workflows.JobHandle<T>` refreshes or waits for an existing job ID.

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

## Streaming and errors

`streamResponse(payload)` returns raw SSE lines. For chat, use
`rawClient().requestLines("POST", "/chat/completions", null, null, jsonBody)`
with `stream: true` in the JSON body. Both streams deliver lines incrementally;
handle SSE event/data framing and completion markers in your application, and
close the stream with try-with-resources.

Retries default to zero. `setMaxRetries(n)` retries safe GET/HEAD requests;
writes and streaming calls are not replayed. `Client.ApiException` preserves
HTTP status, response body, headers, and request ID.

The `createSpeech` wrapper expects JSON and cannot decode binary audio. Use
`rawClient().requestBytes("POST", "/audio/speech", null, null, jsonBody)` instead.

See the [Java SDK guide](https://phaseo.app/docs/v1/sdk-reference/java/overview)
for complete examples.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:java`
- Build: `pnpm --filter @phaseo/java-sdk run build`
- Test: `pnpm --filter @phaseo/java-sdk run test`
