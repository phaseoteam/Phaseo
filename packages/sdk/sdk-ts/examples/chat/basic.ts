import { AIStats } from "../../src";

const apiKey = process.env.AI_STATS_API_KEY;
if (!apiKey) throw new Error("Set AI_STATS_API_KEY");

async function main() {
	const client = new AIStats({ apiKey });
	const response = await client.chat.completions.create({
		model: "openai/gpt-5-nano",
		messages: [{ role: "user", content: "Say hi in one sentence." }],
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
