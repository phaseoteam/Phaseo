import { AIStats } from "../../src";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) throw new Error("Set AI_STATS_API_KEY");

async function main() {
	const client = new AIStats({ apiKey });
	const stream = await client.chat.completions.create({
		model: "openai/gpt-5-nano",
		messages: [{ role: "user", content: "Write a short greeting." }],
		stream: true,
	});

	for await (const line of stream as AsyncGenerator<string>) {
		if (line === "data: [DONE]") break;
		console.log(line);
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
