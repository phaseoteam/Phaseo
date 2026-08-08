export type RouteAvailabilityPolicy = {
	mode: "allowlist" | "blocklist";
	countries: string[];
	countrySource: "request_origin";
	unknownCountry: "allow" | "deny";
	blockedSubdivisions?: string[];
	unknownSubdivision?: "allow" | "deny";
	reason?: string | null;
	sourceUrl?: string | null;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
};

export type RouteAvailabilityResult = {
	ok: boolean;
	reason: string | null;
};

export function parseRouteAvailabilityPolicy(value: unknown): RouteAvailabilityPolicy | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	if (raw.mode !== "allowlist" && raw.mode !== "blocklist") return null;
	if (!Array.isArray(raw.countries) || raw.countries.length === 0) return null;
	const countries = raw.countries.map(normalizeCountry);
	if (countries.some((country) => country === null)) return null;
	if (raw.country_source !== "request_origin") return null;
	if (raw.unknown_country !== "allow" && raw.unknown_country !== "deny") return null;
	return {
		mode: raw.mode,
		countries: countries as string[],
		countrySource: "request_origin",
		unknownCountry: raw.unknown_country,
		blockedSubdivisions: Array.isArray(raw.blocked_subdivisions)
			? raw.blocked_subdivisions.map(String).map((value) => value.trim().toUpperCase()).filter(Boolean)
			: [],
		unknownSubdivision: raw.unknown_subdivision === "deny" ? "deny" : "allow",
		reason: typeof raw.reason === "string" ? raw.reason : null,
		sourceUrl: typeof raw.source_url === "string" ? raw.source_url : null,
		effectiveFrom: typeof raw.effective_from === "string" ? raw.effective_from : null,
		effectiveTo: typeof raw.effective_to === "string" ? raw.effective_to : null,
	};
}

function normalizeCountry(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const country = value.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(country) || country === "XX") return null;
	return country;
}

function isPolicyActive(policy: RouteAvailabilityPolicy, nowMs: number): boolean {
	const fromMs = policy.effectiveFrom ? Date.parse(policy.effectiveFrom) : Number.NaN;
	const toMs = policy.effectiveTo ? Date.parse(policy.effectiveTo) : Number.NaN;
	if (Number.isFinite(fromMs) && nowMs < fromMs) return false;
	if (Number.isFinite(toMs) && nowMs >= toMs) return false;
	return true;
}

export function routeMeetsAvailabilityPolicy(
	policy: RouteAvailabilityPolicy | null | undefined,
	requestCountry: unknown,
	requestRegionCode?: unknown,
	nowMs = Date.now(),
): RouteAvailabilityResult {
	if (!policy || !isPolicyActive(policy, nowMs)) return { ok: true, reason: null };

	const country = normalizeCountry(requestCountry);
	if (!country) {
		return policy.unknownCountry === "allow"
			? { ok: true, reason: null }
			: { ok: false, reason: "request_country_unknown" };
	}

	const countries = new Set(policy.countries.map(normalizeCountry).filter(Boolean));
	const listed = countries.has(country);
	const ok = policy.mode === "allowlist" ? listed : !listed;
	if (!ok) {
		return {
			ok: false,
			reason: policy.mode === "allowlist"
				? "request_country_not_allowed"
				: "request_country_blocked",
		};
	}

	const blockedSubdivisions = new Set(
		(policy.blockedSubdivisions ?? []).map((value) => value.trim().toUpperCase()),
	);
	const appliesSubdivisionPolicy = Array.from(blockedSubdivisions).some((value) =>
		value.startsWith(`${country}-`),
	);
	if (appliesSubdivisionPolicy) {
		const regionCode = typeof requestRegionCode === "string"
			? requestRegionCode.trim().toUpperCase()
			: "";
		if (!regionCode) {
			return policy.unknownSubdivision === "deny"
				? { ok: false, reason: "request_subdivision_unknown" }
				: { ok: true, reason: null };
		}
		const subdivision = regionCode.startsWith(`${country}-`)
			? regionCode
			: `${country}-${regionCode}`;
		if (blockedSubdivisions.has(subdivision)) {
			return { ok: false, reason: "request_subdivision_blocked" };
		}
	}
	return {
		ok: true,
		reason: null,
	};
}
