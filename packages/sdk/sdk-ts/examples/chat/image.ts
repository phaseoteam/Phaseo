import { Phaseo } from "../../src";

const apiKey = process.env.PHASEO_API_KEY;
if (!apiKey) throw new Error("Set PHASEO_API_KEY");

async function main() {
	const client = new Phaseo({ apiKey });
	const response = await client.chat.completions.create({
		model: "openai/gpt-5-nano",
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "What is in this image?" },
					{
						type: "image_url",
						image_url: {
							url: "https://raw.githubusercontent.com/github/explore/main/topics/python/python.png",
						},
					},
				],
			},
		],
	});

	console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
