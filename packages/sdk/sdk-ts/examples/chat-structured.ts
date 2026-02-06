import { AIStats } from "../src";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) throw new Error("Set AI_STATS_API_KEY");

async function main() {
	const client = new AIStats({ apiKey });
	const response = await client.chat.completions.create({
		model: "openai/gpt-5-nano",
		messages: [{ role: "user", content: "List two colors and their hex codes." }],
		response_format: {
			type: "json_schema",
			schema: {
				type: "object",
				properties: {
					colors: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								hex: { type: "string" },
							},
							required: ["name", "hex"],
						},
					},
				},
				required: ["colors"],
			},
		},
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
