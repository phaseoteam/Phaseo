import { AIStats } from "../../src";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) throw new Error("Set AI_STATS_API_KEY");

async function main() {
	const client = new AIStats({ apiKey });
	const response = await client.responses.create({
		model: "openai/gpt-5-nano",
		input_items: [
			{ role: "user", content: "Give me a short tagline." },
			{ role: "user", content: "Make it about reliability." },
		],
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
