import { WebApiError } from "@/lib/web-api/client";
import { shouldRetryWebQuery } from "./policies";

describe("web query retry policy", () => {
	it("does not retry client or authentication errors", () => {
		for (const status of [400, 401, 403, 404]) {
			expect(shouldRetryWebQuery(0, new WebApiError("/api/_web/test", status))).toBe(false);
		}
	});

	it("allows transient failures twice", () => {
		expect(shouldRetryWebQuery(0, new Error("network"))).toBe(true);
		expect(shouldRetryWebQuery(1, new Error("network"))).toBe(true);
		expect(shouldRetryWebQuery(2, new Error("network"))).toBe(false);
	});
});
