import type { ProviderContract } from "../registry.js";
import { ProviderMockServer } from "../server.js";
import type { MockRequest } from "../types.js";
import { openAIResponders } from "./openai.js";

export function registerNovitaProvider(server: ProviderMockServer, contract: ProviderContract): ProviderMockServer {
  if (contract.manifest.providerId !== "novita") throw new Error("registerNovitaProvider requires the Novita contract");
  const openai = openAIResponders({ text: "Hello from the Phaseo Novita contract mock." });
  return server.registerOpenApi("novita", contract.document, {
    strict: true,
    responses: {
      createChatCompletion: openai.createChatCompletion,
      createCompletion: (request: MockRequest) => ({ body: { id: `cmpl_${request.id}`, object: "text_completion", created: 1, model: (request.body as any)?.model, choices: [{ index: 0, text: "Hello from the Phaseo Novita contract mock.", finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } } }),
      createEmbedding: openai.createEmbedding,
      createRerank: (request: MockRequest) => ({ body: { id: `rerank_${request.id}`, model: (request.body as any)?.model, results: [{ index: 0, relevance_score: 0.91 }] } }),
      listModels: () => ({ body: { object: "list", data: [{ id: "novita-mock-model", object: "model", owned_by: "novita" }] } }),
      retrieveModel: (request: MockRequest) => ({ body: { id: request.path.split("/").at(-1), object: "model", owned_by: "novita" } }),
    },
  });
}
