import { AIStats } from "../../src";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) throw new Error("Set AI_STATS_API_KEY");

async function main() {
	const client = new AIStats({ apiKey });
	const response = await client.chat.completions.create({
		model: "openai/gpt-5-nano",
		messages: [{ role: "user", content: "What is 6 * 7?" }],
		tools: [
			{
				type: "function",
				function: {
					name: "multiply",
					description: "Multiply two numbers",
					parameters: {
						type: "object",
						properties: {
							a: { type: "number" },
							b: { type: "number" },
						},
						required: ["a", "b"],
					},
				},
			},
		],
		tool_choice: "auto",
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
