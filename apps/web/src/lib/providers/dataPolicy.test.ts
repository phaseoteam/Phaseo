import { resolveProviderDataPolicy } from "./dataPolicy";

export {};

describe("resolveProviderDataPolicy", () => {
	it("derives private when legacy policy is no-train with ZDR default", () => {
		expect(
			resolveProviderDataPolicy({
				promptTrainingPolicy: "no_train",
				zeroDataRetention: "default",
			}),
		).toEqual({
			tier: "private",
			confidence: "confirmed",
			contractMode: "none",
		});
	});

	it("derives logs when legacy policy is no-train without default ZDR", () => {
		expect(
			resolveProviderDataPolicy({
				promptTrainingPolicy: "no_train",
				zeroDataRetention: "optional",
			}),
		).toEqual({
			tier: "logs",
			confidence: "maybe",
			contractMode: "none",
		});
	});

	it("derives trains when legacy policy may train or opt-out", () => {
		expect(
			resolveProviderDataPolicy({
				promptTrainingPolicy: "may_train",
				zeroDataRetention: "unknown",
			}),
		).toEqual({
			tier: "trains",
			confidence: "maybe",
			contractMode: "none",
		});
		expect(
			resolveProviderDataPolicy({
				promptTrainingPolicy: "opt_out_available",
				zeroDataRetention: "unknown",
			}),
		).toEqual({
			tier: "trains",
			confidence: "maybe",
			contractMode: "none",
		});
	});

	it("prefers explicit tier, confidence, and contract metadata", () => {
		expect(
			resolveProviderDataPolicy({
				tier: "private",
				confidence: "confirmed",
				contractMode: "enterprise_agreement",
				promptTrainingPolicy: "may_train",
				zeroDataRetention: "unknown",
			}),
		).toEqual({
			tier: "private",
			confidence: "confirmed",
			contractMode: "enterprise_agreement",
		});
	});
});
