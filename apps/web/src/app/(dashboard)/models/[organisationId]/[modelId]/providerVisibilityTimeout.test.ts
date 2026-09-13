import { withOptionalProviderVisibilityTimeout } from "./providerVisibilityTimeout";

describe("withOptionalProviderVisibilityTimeout", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it("returns the fallback and aborts a request that never settles", async () => {
		jest.useFakeTimers();
		const controller = new AbortController();
		const neverSettlingRequest = new Promise<string>(() => undefined);
		const result = withOptionalProviderVisibilityTimeout(
			neverSettlingRequest,
			"fallback",
			1_000,
			() => controller.abort(),
		);

		jest.advanceTimersByTime(1_000);

		await expect(result).resolves.toBe("fallback");
		expect(controller.signal.aborted).toBe(true);
	});
});
