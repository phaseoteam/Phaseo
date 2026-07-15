import { describe, expect, it } from "vitest";
import { normalizeGatewayBaseUrl } from "./test-config";

describe("normalizeGatewayBaseUrl", () => {
	it.each([
		[undefined, undefined],
		["http://localhost:8787", "http://localhost:8787/v1"],
		["http://localhost:8787/", "http://localhost:8787/v1"],
		["http://localhost:8787/v1", "http://localhost:8787/v1"],
		["http://localhost:8787/v1/", "http://localhost:8787/v1"],
	])("normalizes %s to the versioned API base", (input, expected) => {
		expect(normalizeGatewayBaseUrl(input)).toBe(expected);
	});
});
