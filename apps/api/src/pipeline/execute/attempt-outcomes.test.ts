import { describe, expect, it } from "vitest";
import { everyAttemptRateLimited, everyAttemptRejectedRequest, sharedRequestRejectionStatus } from "./attempt-outcomes";

const upstream = (status: number) => ({ type: "upstream_non_2xx", status });

describe("everyAttemptRateLimited", () => {
	it("is true when every dispatched attempt returned 429", () => {
		expect(everyAttemptRateLimited([upstream(429), { type: "blocked" }, upstream(429)])).toBe(true);
	});

	it.each([
		[[upstream(429), upstream(503)]],
		[[upstream(429), { type: "error", message: "socket hang up" }]],
		[[{ type: "blocked" }, { type: "no_pricing" }]],
		[[]],
		[undefined],
	])("is false for %j", (attempts) => {
		expect(everyAttemptRateLimited(attempts as any)).toBe(false);
	});
});

describe("everyAttemptRejectedRequest", () => {
	it.each([400, 413, 422])("is true when every provider rejected the request with %s", (status) => {
		expect(everyAttemptRejectedRequest([upstream(status), upstream(400)])).toBe(true);
	});

	it.each([401, 403, 404, 408, 429, 500])("is false for a %s, which another model may not hit", (status) => {
		expect(everyAttemptRejectedRequest([upstream(400), upstream(status)])).toBe(false);
	});

	it("is false when a provider threw instead of answering", () => {
		expect(everyAttemptRejectedRequest([upstream(400), { type: "retryable_error" }])).toBe(false);
	});
});

describe("sharedRequestRejectionStatus", () => {
	it.each([400, 413, 422])("is %s when every dispatched attempt returned it", (status) => {
		expect(sharedRequestRejectionStatus([upstream(status), { type: "blocked" }, upstream(status)])).toBe(status);
	});

	it.each([
		[[upstream(400), upstream(422)]],
		[[upstream(400), upstream(500)]],
		[[upstream(404)]],
		[[{ type: "blocked" }]],
		[[]],
		[undefined],
	])("is null for %j", (attempts) => {
		expect(sharedRequestRejectionStatus(attempts as any)).toBeNull();
	});
});
