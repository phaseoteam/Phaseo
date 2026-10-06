import { createAgent, type AgentModelClient } from "@phaseo/agent-sdk";
import { phaseoClient } from "./runner.js";

/** Product helpers use the same gateway client with no filesystem or command tools. */
export async function generatePhaseoText(options: {
  model: string;
  key: string;
  prompt: string;
  signal: AbortSignal;
  client?: AgentModelClient;
}) {
  const agent = createAgent({
    id: "phaseo-text-generation",
    model: options.model,
    maxSteps: 1,
    instructions:
      "Complete the requested text-generation task. Return exactly one JSON object in the requested shape, without Markdown fences or commentary. Do not call tools.",
    modelRetry: { maxRetries: 2, backoffMs: 500 },
    tools: [],
  });
  const result = await agent.run({
    input: options.prompt,
    signal: options.signal,
    client: options.client ?? phaseoClient(options.key),
  });
  if (result.run.status !== "completed" || typeof result.output !== "string")
    throw new Error("Phaseo text generation did not complete.");
  return result.output;
}
