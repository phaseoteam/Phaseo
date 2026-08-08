export type RestrictedModelPreview = {
	id: string;
	name: string;
	logoId: string | null;
	organisationName: string;
};

type RouteAvailabilityPolicy = {
	mode: "allowlist" | "blocklist";
	countries: string[];
	blockedSubdivisions: string[];
	effectiveFrom: string | null;
	effectiveTo: string | null;
};

type RouteCountryAvailability = {
	available: boolean;
	subdivisionRestricted: boolean;
};

function normalizeCountry(value: unknown): string | null {
	const country = typeof value === "string" ? value.trim().toUpperCase() : "";
	return /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : null;
}

function parseRouteAvailabilityPolicy(value: unknown): RouteAvailabilityPolicy | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	if (raw.mode !== "allowlist" && raw.mode !== "blocklist") return null;
	if (!Array.isArray(raw.countries) || raw.countries.length === 0) return null;
	const countries = raw.countries.map(normalizeCountry);
	if (countries.some((country) => country === null)) return null;
	return {
		mode: raw.mode,
		countries: countries as string[],
		blockedSubdivisions: Array.isArray(raw.blocked_subdivisions)
			? raw.blocked_subdivisions.map(String).map((item) => item.trim().toUpperCase()).filter(Boolean)
			: [],
		effectiveFrom: typeof raw.effective_from === "string" ? raw.effective_from : null,
		effectiveTo: typeof raw.effective_to === "string" ? raw.effective_to : null,
	};
}

function routeCountryAvailability(value: unknown, countryValue: unknown, nowMs: number): RouteCountryAvailability {
	const policy = parseRouteAvailabilityPolicy(value);
	const country = normalizeCountry(countryValue);
	if (!policy || !country) return { available: true, subdivisionRestricted: false };
	const fromMs = policy.effectiveFrom ? Date.parse(policy.effectiveFrom) : Number.NaN;
	const toMs = policy.effectiveTo ? Date.parse(policy.effectiveTo) : Number.NaN;
	if ((Number.isFinite(fromMs) && nowMs < fromMs) || (Number.isFinite(toMs) && nowMs >= toMs)) {
		return { available: true, subdivisionRestricted: false };
	}
	const listed = policy.countries.includes(country);
	const available = policy.mode === "allowlist" ? listed : !listed;
	return {
		available,
		subdivisionRestricted: available && policy.blockedSubdivisions.some((subdivision) => subdivision.startsWith(`${country}-`)),
	};
}

export function buildRestrictedModelPreview(args: {
	countryCode: string;
	routes: Array<{ modelSlug: string; availability: unknown }>;
	models: Array<{
		modelSlug: string;
		name: string | null;
		logoId: string | null;
		organisationName: string | null;
	}>;
	nowMs: number;
}) {
	const modelDetails = new Map(args.models.map((model) => [model.modelSlug, model]));
	const routesByModel = new Map<string, RouteCountryAvailability[]>();
	for (const route of args.routes) {
		const modelSlug = route.modelSlug.trim();
		if (!modelSlug) continue;
		const existing = routesByModel.get(modelSlug) ?? [];
		existing.push(routeCountryAvailability(route.availability, args.countryCode, args.nowMs));
		routesByModel.set(modelSlug, existing);
	}

	const restrictedModels: RestrictedModelPreview[] = [];
	const regionRestrictedModels: RestrictedModelPreview[] = [];
	for (const [modelSlug, routes] of routesByModel) {
		const details = modelDetails.get(modelSlug);
		const model = {
			id: modelSlug,
			name: details?.name?.trim() || modelSlug,
			logoId: details?.logoId ?? null,
			organisationName: details?.organisationName?.trim() || details?.logoId || "Other",
		};
		const availableRoutes = routes.filter((route) => route.available);
		if (availableRoutes.length === 0) restrictedModels.push(model);
		else if (availableRoutes.every((route) => route.subdivisionRestricted)) regionRestrictedModels.push(model);
	}
	const byName = (left: RestrictedModelPreview, right: RestrictedModelPreview) =>
		left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
	return {
		restrictedModels: restrictedModels.sort(byName),
		regionRestrictedModels: regionRestrictedModels.sort(byName),
	};
}
