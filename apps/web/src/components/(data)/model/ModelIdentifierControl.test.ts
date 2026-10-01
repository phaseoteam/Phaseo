import { resolveModelIdentifierOptions } from "./ModelIdentifierControl";

describe("model identifier options", () => {
	it("keeps a route-validated alias when alias enrichment is unavailable", () => {
		expect(resolveModelIdentifierOptions({
			defaultIdentifier: "openai/gpt-6-astra",
			aliases: [],
			requestedAlias: " OpenAI/GPT-Astra-Latest ",
		})).toEqual({
			options: ["openai/gpt-6-astra", "openai/gpt-astra-latest"],
			displayedIdentifier: "openai/gpt-astra-latest",
		});
	});
});
