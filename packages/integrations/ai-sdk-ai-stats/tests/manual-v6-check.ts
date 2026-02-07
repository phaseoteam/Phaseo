import { generateText, streamText, embed } from "ai";
import { createAIStats } from "../src/index.js";

const apiKey =
	process.env.AI_STATS_API_KEY || process.env.OPENAI_GATEWAY_API_KEY;
if (!apiKey) {
	throw new Error(
		"Missing AI_STATS_API_KEY or OPENAI_GATEWAY_API_KEY in the environment."
	);
}

const aiStats = createAIStats({
	apiKey,
	baseURL: process.env.AI_STATS_BASE_URL,
});

async function run() {
	const modelId = "openai/gpt-5-nano";
	const embeddingModelId = "google/gemini-embedding-001";

	console.log("Running generateText...");
	const textResult = await generateText({
		model: aiStats(modelId),
		prompt: 'Say "AI SDK v6 OK" and nothing else.',
		maxTokens: 20,
	});
	console.log("generateText text:", textResult.text);

	console.log("Running streamText...");
	const streamResult = streamText({
		model: aiStats(modelId),
		prompt: "Stream two short sentences.",
		maxTokens: 80,
	});
	let streamTextOutput = "";
	for await (const chunk of streamResult.textStream) {
		streamTextOutput += chunk;
	}
	console.log("streamText text:", streamTextOutput);

	console.log("Running tool call...");
	const toolResult = await generateText({
		model: aiStats(modelId),
		prompt: "What is 25 + 17? Use the calculator tool.",
		maxTokens: 120,
		tools: {
			calculator: {
				description: "Perform basic arithmetic",
				parameters: {
					type: "object",
					properties: {
						operation: {
							type: "string",
							enum: ["add", "subtract", "multiply", "divide"],
						},
						a: { type: "number" },
						b: { type: "number" },
					},
					required: ["operation", "a", "b"],
				},
				execute: async ({ operation, a, b }: any) => {
					switch (operation) {
						case "add":
							return a + b;
						case "subtract":
							return a - b;
						case "multiply":
							return a * b;
						case "divide":
							return a / b;
						default:
							throw new Error("Invalid operation");
					}
				},
			},
		},
	});
	console.log("tool call text:", toolResult.text);

	console.log("Running embeddings...");
	const embeddingResult = await embed({
		model: aiStats.embeddingModel(embeddingModelId),
		value: "Hello, embeddings.",
	});
	console.log("embedding length:", embeddingResult.embedding.length);
	console.log("embedding usage:", embeddingResult.usage);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
