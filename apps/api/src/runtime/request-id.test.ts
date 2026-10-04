import { describe, expect, it } from "vitest";
import { inheritRequestId, requestIdFor } from "./request-id";
import { sanitizeRequestHeaders } from "@/pipeline/http/sanitize-headers";

describe("requestIdFor", () => {
	it("preserves server identity across sanitized inference requests", () => {
		const original = new Request("https://api.phaseo.app/v1/responses", { headers: { "x-request-id": "caller-id" } });
		const publicId = requestIdFor(original);
		const sanitized = sanitizeRequestHeaders(original, { preserve: ["authorization"] });
		inheritRequestId(original, sanitized);
		expect(requestIdFor(sanitized)).toBe(publicId);
		expect(requestIdFor(sanitized)).not.toBe("caller-id");
	});
	it("reuses one generated ID for the same request", () => {
		const request = new Request("https://api.phaseo.app/v1/models");
		expect(requestIdFor(request)).toMatch(/^G-[0-9A-HJKMNP-TV-Z]{26}$/);
		expect(requestIdFor(request)).toBe(requestIdFor(request));
	});

	it("generates a public G ID instead of echoing a supplied ID", () => {
		const request = new Request("https://api.phaseo.app/v1/models", { headers: { "x-request-id": "browser-request-123" } });
		expect(requestIdFor(request)).toMatch(/^G-[0-9A-HJKMNP-TV-Z]{26}$/);
		expect(requestIdFor(request)).not.toBe("browser-request-123");
	});

	it.each(["reused", "7164858f-b7c5-4a6a-a79b-9d1607470e57", "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8W"])("does not reuse caller identity %s across requests", (supplied) => {
		const first = new Request("https://api.phaseo.app/v1/responses", { headers: { "x-request-id": supplied } });
		const second = new Request(first);
		expect(requestIdFor(first)).toMatch(/^G-[0-9A-HJKMNP-TV-Z]{26}$/);
		expect(requestIdFor(first)).not.toBe(requestIdFor(second));
	});

	it("rejects unsafe supplied IDs", () => {
		const request = new Request("https://api.phaseo.app/v1/models", { headers: { "x-request-id": "unsafe request id" } });
		expect(requestIdFor(request)).not.toBe("unsafe request id");
	});
});
