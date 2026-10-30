import { isThirdPartyOAuthEnabled } from "./thirdPartyOAuth";

describe("third-party OAuth rollout", () => {
	it("is enabled for the hosted default", () => {
		expect(isThirdPartyOAuthEnabled({} as NodeJS.ProcessEnv)).toBe(true);
	});

	it("can be disabled explicitly for a preview or self-hosted deployment", () => {
		expect(isThirdPartyOAuthEnabled({
			PHASEO_THIRD_PARTY_OAUTH_ENABLED: "false",
		} as unknown as NodeJS.ProcessEnv)).toBe(false);
	});
});
