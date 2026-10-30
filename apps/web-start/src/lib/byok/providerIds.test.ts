import { canonicalByokProviderId } from "./providerIds";

describe("canonicalByokProviderId", () => {
	it("hard-moves legacy xAI provider ids to SpaceXAI", () => {
		expect(canonicalByokProviderId("x-ai")).toBe("spacex-ai");
		expect(canonicalByokProviderId("xai")).toBe("spacex-ai");
		expect(canonicalByokProviderId(" X-AI ")).toBe("spacex-ai");
	});

	it("keeps non-xAI provider ids normalized but unchanged", () => {
		expect(canonicalByokProviderId("OpenAI")).toBe("openai");
		expect(canonicalByokProviderId("google-ai-studio")).toBe("google-ai-studio");
	});
});
