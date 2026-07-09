import { Phaseo } from "../../src";

const apiKey = process.env.PHASEO_API_KEY;
if (!apiKey) throw new Error("Set PHASEO_API_KEY");

async function main() {
	const client = new Phaseo({ apiKey });
	const response = await client.messages.create({
		model: "openai/gpt-5-nano",
		messages: [{ role: "user", content: "Say hi in one sentence." }],
		max_tokens: 64,
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
