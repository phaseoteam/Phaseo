import { describe, expect, it } from "vitest";
import {
	getProviderStreamCancellationPolicy,
	supportsProviderStreamCancellation,
} from "./stream-cancellation";

describe("supportsProviderStreamCancellation", () => {
	it("returns true for explicitly supported providers", () => {
		expect(supportsProviderStreamCancellation("openai")).toBe(true);
		expect(supportsProviderStreamCancellation("anthropic")).toBe(true);
		expect(supportsProviderStreamCancellation("x-ai")).toBe(true);
		expect(supportsProviderStreamCancellation("xai")).toBe(true);
		expect(supportsProviderStreamCancellation("novitaai")).toBe(true);
	});

	it("returns false for explicitly unsupported providers", () => {
		expect(supportsProviderStreamCancellation("amazon-bedrock")).toBe(false);
		expect(supportsProviderStreamCancellation("groq")).toBe(false);
		expect(supportsProviderStreamCancellation("google-ai-studio")).toBe(false);
		expect(supportsProviderStreamCancellation("nebius-token-factory")).toBe(false);
	});

	it("defaults unknown providers to false", () => {
		expect(supportsProviderStreamCancellation("unknown-provider")).toBe(false);
		expect(supportsProviderStreamCancellation("")).toBe(false);
	});

	it("keeps draining even where cancellation stops provider billing until exact usage is recoverable", () => {
		expect(getProviderStreamCancellationPolicy("openai")).toMatchObject({
			support: "supported",
			providerBillingOnCancel: "stops",
			usageRecovery: "unknown",
			gatewayAction: "drain_upstream",
			evidenceKind: "aggregator",
		});
	});

	it("maps regional and hosted variants to the correct provider family", () => {
		expect(getProviderStreamCancellationPolicy("openai-eu").support).toBe("supported");
		expect(getProviderStreamCancellationPolicy("anthropic-aws").support).toBe("unsupported");
		expect(getProviderStreamCancellationPolicy("google-vertex-eu").support).toBe("unsupported");
	});
});

