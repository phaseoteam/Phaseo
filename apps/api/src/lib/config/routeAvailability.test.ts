import { describe, expect, it } from "vitest";
import { routeMeetsAvailabilityPolicy, type RouteAvailabilityPolicy } from "./routeAvailability";

const allowlist: RouteAvailabilityPolicy = {
	mode: "allowlist",
	countries: ["GB", "US"],
	countrySource: "request_origin",
	unknownCountry: "deny",
};

describe("routeMeetsAvailabilityPolicy", () => {
	it("allows listed countries and blocks other countries", () => {
		expect(routeMeetsAvailabilityPolicy(allowlist, "gb")).toEqual({ ok: true, reason: null });
		expect(routeMeetsAvailabilityPolicy(allowlist, "CN")).toEqual({
			ok: false,
			reason: "request_country_not_allowed",
		});
	});

	it("honours unknown-country handling", () => {
		expect(routeMeetsAvailabilityPolicy(allowlist, "XX")).toEqual({
			ok: false,
			reason: "request_country_unknown",
		});
		expect(routeMeetsAvailabilityPolicy({ ...allowlist, unknownCountry: "allow" }, null)).toEqual({
			ok: true,
			reason: null,
		});
	});

	it("ignores policies outside their effective window", () => {
		expect(routeMeetsAvailabilityPolicy({
			...allowlist,
			effectiveFrom: "2027-01-01T00:00:00Z",
		}, "CN", null, Date.parse("2026-08-07T00:00:00Z"))).toEqual({ ok: true, reason: null });
	});

	it("blocks listed subdivisions and fails closed when a required subdivision is unknown", () => {
		const policy: RouteAvailabilityPolicy = {
			...allowlist,
			countries: ["UA"],
			blockedSubdivisions: ["UA-43", "UA-14"],
			unknownSubdivision: "deny",
		};
		expect(routeMeetsAvailabilityPolicy(policy, "UA", "43")).toEqual({
			ok: false,
			reason: "request_subdivision_blocked",
		});
		expect(routeMeetsAvailabilityPolicy(policy, "UA", null)).toEqual({
			ok: false,
			reason: "request_subdivision_unknown",
		});
		expect(routeMeetsAvailabilityPolicy(policy, "UA", "32")).toEqual({ ok: true, reason: null });
	});
});
