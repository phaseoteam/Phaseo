import type { ProviderContract } from "../registry.js";
import { ProviderMockServer } from "../server.js";
import type { MockRequest, MockResponse } from "../types.js";

function payload(request: MockRequest) {
  const body = request.body as any;
  const declaration = body?.tools?.[0]?.functionDeclarations?.[0];
  return {
    candidates: [{
      index: 0,
      content: { role: "model", parts: declaration
        ? [{ functionCall: { name: declaration.name, args: { city: "London" } } }]
        : [{ text: "Hello from the Phaseo Google contract mock." }] },
      finishReason: "STOP",
    }],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3, totalTokenCount: 7 },
    modelVersion: "gemini-mock",
    responseId: `google_${request.id}`,
  };
}

function generateContent(request: MockRequest): MockResponse { return { body: payload(request) }; }

function streamGenerateContent(request: MockRequest): MockResponse {
  return { headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify(payload(request))}\n\n` };
}

function interactions(request: MockRequest): MockResponse {
  const body = request.body as any;
  const tool = body?.tools?.[0];
  return {
    body: {
      id: `interaction_${request.id}`,
      status: "completed",
      steps: tool
        ? [{
            type: "function_call",
            id: "call_google_weather",
            name: tool.name,
            arguments: { city: "London" },
          }]
        : [{
            type: "model_output",
            content: [{ type: "text", text: "Hello from the Phaseo Google contract mock." }],
          }],
      usage: {
        total_input_tokens: 4,
        total_output_tokens: 3,
        total_tokens: 7,
      },
    },
  };
}

export function registerGoogleAIStudioProvider(server: ProviderMockServer, contract: ProviderContract): ProviderMockServer {
  if (contract.manifest.providerId !== "google-ai-studio") throw new Error("registerGoogleAIStudioProvider requires the Google AI Studio contract");
  server.register({
    providerId: "google-ai-studio",
    operationId: "interactions",
    method: "POST",
    path: "/v1beta/interactions",
    response: interactions,
  });
  return server.registerOpenApi("google-ai-studio", contract.document, {
    basePath: "/v1beta",
    strict: true,
    responses: { generateContent, streamGenerateContent },
  });
}
