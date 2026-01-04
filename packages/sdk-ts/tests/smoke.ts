import { AIStats } from "../src/index.js";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) {
	throw new Error("AI_STATS_API_KEY is required");
}

const baseUrl = process.env.AI_STATS_BASE_URL;
const client = new AIStats({ apiKey, baseUrl });

const response = await client.generateText({
	model: "openai/gpt-5-nano-2025-08-07",
	messages: [{ role: "user", content: "Hi" }]
});

console.log(JSON.stringify(response, null, 2));
