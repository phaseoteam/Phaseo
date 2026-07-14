import { Phaseo } from "../../src";

const apiKey = process.env.PHASEO_API_KEY;
if (!apiKey) throw new Error("Set PHASEO_API_KEY");

async function main() {
	const client = new Phaseo({ apiKey });
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
