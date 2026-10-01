type Route = Record<string, any>;

const PROVIDER_AVAILABILITY_STATUSES = new Set([
	"unknown",
	"coming_soon",
	"preview",
	"available",
	"limited_access",
	"deprecated",
	"removed",
]);

const PHASEO_STATUSES = new Set([
	"unsupported",
	"planned",
	"implementing",
	"testing",
	"enabled",
	"disabled",
	"blocked",
]);

function normalizedStatus(value: unknown): string {
	return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function routeCapabilities(route: Route): Route[] {
	return Array.isArray(route.capabilities) ? route.capabilities : [];
}

function providerAvailabilityStatus(route: Route): string {
	const explicitValue = route.provider_status ?? route.provider_availability_status;
	const explicit = normalizedStatus(explicitValue);
	if (PROVIDER_AVAILABILITY_STATUSES.has(explicit)) return explicit;
	if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "unknown";
	const routing = normalizedStatus(route.routing_status);
	if (routing === "retired") return "removed";
	if (routeCapabilities(route).some((capability) => normalizedStatus(capability.status) === "coming_soon")) {
		return "coming_soon";
	}
	return "available";
}

function phaseoStatus(route: Route, providerIsExternal: boolean): string {
	const explicitValue = route.phaseo_status;
	const explicit = normalizedStatus(explicitValue);
	if (PHASEO_STATUSES.has(explicit)) return explicit;
	if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "disabled";
	if (providerIsExternal || route.routable === false) return "unsupported";
	const capabilities = routeCapabilities(route).map((capability) => normalizedStatus(capability.status));
	if (capabilities.includes("internal_testing")) return "testing";
	if (capabilities.includes("coming_soon")) return "planned";
	const routing = normalizedStatus(route.routing_status);
	if (Boolean(route.is_active_gateway) && !["disabled", "retired"].includes(routing)) return "enabled";
	return "disabled";
}

function routeAccessScope(route: Route, providerIsExternal: boolean): string {
	const explicitValue = route.access_scope;
	const explicit = normalizedStatus(explicitValue);
	if (explicit === "public" || explicit === "internal") return explicit;
	if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "internal";
	return providerIsExternal || route.routable === false ? "internal" : "public";
}

function providerAvailabilityAllowsRouting(route: Route): boolean {
	const availability = providerAvailabilityStatus(route);
	if (["available", "preview", "limited_access"].includes(availability)) return true;
	if (availability !== "deprecated") return false;

	const effectiveTo = Date.parse(String(route.effective_to ?? ""));
	return Number.isFinite(effectiveTo) && effectiveTo > Date.now();
}

export function phaseoRoutingEnabled(route: Route, providerIsExternal = false): boolean {
	return phaseoStatus(route, providerIsExternal) === "enabled"
		&& routeAccessScope(route, providerIsExternal) === "public"
		&& providerAvailabilityAllowsRouting(route)
		&& !["disabled", "retired"].includes(normalizedStatus(route.routing_status));
}
