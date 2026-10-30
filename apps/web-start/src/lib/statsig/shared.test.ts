import {
	REALTIME_VOICE_BETA_FEATURE,
	SAML_SSO_GATE,
	withRealtimeVoiceEntitlement,
} from "./shared";

describe("SAML SSO gate", () => {
	it("uses the stable workspace gate key by default", () => {
		expect(SAML_SSO_GATE).toBe("workspace_saml_sso");
	});
});

describe("realtime voice entitlement", () => {
	it("does not trust a stored self-service realtime preference", () => {
		const profile = withRealtimeVoiceEntitlement({
			betaOptIn: true,
			betaFeatures: {
				[REALTIME_VOICE_BETA_FEATURE]: true,
				other_preview: true,
			},
		}, false);

		expect(profile.betaFeatures[REALTIME_VOICE_BETA_FEATURE]).toBeUndefined();
		expect(profile.betaFeatures.other_preview).toBe(true);
	});

	it("adds realtime only after a server-side entitlement succeeds", () => {
		const profile = withRealtimeVoiceEntitlement({
			betaOptIn: false,
			betaFeatures: {},
		}, true);

		expect(profile.betaOptIn).toBe(true);
		expect(profile.betaFeatures[REALTIME_VOICE_BETA_FEATURE]).toBe(true);
	});
});
