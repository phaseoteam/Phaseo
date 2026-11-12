import { describe, expect, it } from "vitest";
import {
	applyDownstreamRateLimitHeaders,
	extractDownstreamRateLimitHeaders,
	readDownstreamRateLimitHeaders,
} from "./upstream-rate-limit-headers";

describe("upstream rate-limit response headers", () => {
	it("exposes validated retry guidance but hides managed-key quota details", () => {
		const result = extractDownstreamRateLimitHeaders(new Headers({
			"retry-after": "12",
			"x-ratelimit-limit-requests": "100",
			"x-ratelimit-remaining-requests": "0",
			"set-cookie": "provider_session=secret",
			"x-provider-account-id": "private-account",
		}), { includeQuotaDetails: false });

		expect(result).toEqual({ "Retry-After": "12" });
	});

	it("prefixes allowlisted quota details for BYOK without copying other headers", () => {
		const result = extractDownstreamRateLimitHeaders(new Headers({
			"ratelimit-limit": "1000",
			"x-ratelimit-remaining-tokens": "24500",
			"x-ratelimit-reset-tokens": "2m30s",
			"authorization": "Bearer provider-secret",
			"set-cookie": "provider_session=secret",
		}), { includeQuotaDetails: true });

		expect(result).toEqual({
			"X-Phaseo-Upstream-RateLimit-Limit": "1000",
			"X-Phaseo-Upstream-RateLimit-Remaining-Tokens": "24500",
			"X-Phaseo-Upstream-RateLimit-Reset-Tokens": "2m30s",
		});
	});

	it("rejects malformed values without inventing retry guidance", () => {
		const result = extractDownstreamRateLimitHeaders(new Headers({
			"retry-after": "not-a-delay",
			"x-ratelimit-limit": "private account unlimited",
		}), { includeQuotaDetails: true });

		expect(result).toEqual({});
	});

	it("applies only known downstream names", () => {
		const headers = new Headers();
		applyDownstreamRateLimitHeaders(headers, {
			"Retry-After": "10",
			"X-Phaseo-Upstream-RateLimit-Remaining": "0",
			"Set-Cookie": "secret=true",
		});

		expect(headers.get("Retry-After")).toBe("10");
		expect(headers.get("X-Phaseo-Upstream-RateLimit-Remaining")).toBe("0");
		expect(headers.get("Set-Cookie")).toBeNull();
	});

	it("re-reads downstream rate-limit headers from a gateway error response, never provider names", () => {
		const result = readDownstreamRateLimitHeaders(new Headers({
			"retry-after": "9",
			"X-Phaseo-Upstream-RateLimit-Remaining-Requests": "0",
			"X-Phaseo-Upstream-RateLimit-Reset-Requests": "7s",
			"X-Phaseo-Upstream-RateLimit-Limit": "private account unlimited",
			// Provider names are not downstream headers, so a raw upstream response
			// cannot leak a shared account's quota through this reader.
			"x-ratelimit-remaining-requests": "42",
		}));

		expect(result).toEqual({
			"Retry-After": "9",
			"X-Phaseo-Upstream-RateLimit-Remaining-Requests": "0",
			"X-Phaseo-Upstream-RateLimit-Reset-Requests": "7s",
		});
	});
	it("drops a Retry-After over 24 hours unless the limit is gateway-originated", () => {
		const headers = new Headers({ "Retry-After": "388800" });
		expect(readDownstreamRateLimitHeaders(headers)).toEqual({});
		expect(readDownstreamRateLimitHeaders(headers, { gatewayOriginated: true })).toEqual({ "Retry-After": "388800" });
		expect(extractDownstreamRateLimitHeaders(headers, { includeQuotaDetails: false })).toEqual({});
	});
});
