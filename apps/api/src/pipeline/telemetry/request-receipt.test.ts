import { describe, expect, it } from "vitest";
import { inheritRequestReceipt, markRequestReceived, requestReceivedAtMs } from "./request-receipt";

describe("request receipt", () => {
	it("carries the receipt time onto a rebuilt request", () => {
		const original = new Request("https://gateway.test/v1/chat/completions");
		const rebuilt = new Request(original);
		markRequestReceived(original, 1234);
		expect(requestReceivedAtMs(rebuilt)).toBeUndefined();
		inheritRequestReceipt(original, rebuilt);
		expect(requestReceivedAtMs(rebuilt)).toBe(1234);
	});

	it("leaves requests the Worker did not receive unmarked", () => {
		const internal = new Request("https://gateway.test/internal");
		const rebuilt = new Request(internal);
		inheritRequestReceipt(internal, rebuilt);
		expect(requestReceivedAtMs(rebuilt)).toBeUndefined();
	});
});
