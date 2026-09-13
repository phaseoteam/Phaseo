import {
	CHAT_DEFAULT_MODEL_IDS,
	FEATURED_MODEL_IDS,
} from "./playgroundConfig";

const CURRENT_FEATURED_MODEL_IDS = [
	"z-ai/glm-5.3",
	"moonshotai/kimi-k3",
	"anthropic/claude-fable-5.1",
	"minimax/minimax-m3",
	"anthropic/claude-opus-5",
	"spacex-ai/grok-4.6",
	"openai/gpt-6-astra",
	"google/gemini-3.8-flash",
];

describe("chat featured models", () => {
	it("uses the current featured model generations", () => {
		expect(FEATURED_MODEL_IDS).toEqual(CURRENT_FEATURED_MODEL_IDS);
		expect(CHAT_DEFAULT_MODEL_IDS).toEqual(CURRENT_FEATURED_MODEL_IDS);
	});
});
