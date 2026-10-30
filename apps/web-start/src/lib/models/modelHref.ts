type ModelRouteParts = {
	organisationId: string;
	routeSlug: string;
};

export function decodeModelRouteSegment(value: string): string {
	if (!value.includes("%")) return value;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function getModelRouteParts(
	modelId?: string | null,
	organisationId?: string | null,
): ModelRouteParts | null {
	const normalizedModelId = String(modelId ?? "").trim();
	const normalizedOrganisationId = String(organisationId ?? "").trim();

	if (!normalizedModelId) return null;

	const [firstSegment, ...restSegments] = normalizedModelId.split("/");
	if (firstSegment && restSegments.length > 0) {
		const routeSlug = restSegments.join("/").trim();
		if (!routeSlug) return null;
		return {
			organisationId: firstSegment,
			routeSlug,
		};
	}

	if (!normalizedOrganisationId) return null;

	return {
		organisationId: normalizedOrganisationId,
		routeSlug: normalizedModelId,
	};
}

export function getModelRouteSlug(
	modelId: string,
	organisationId?: string | null,
) {
	const routeParts = getModelRouteParts(modelId, organisationId);
	if (!routeParts) return "";

	return routeParts.routeSlug;
}

export function getModelDetailsHref(
	organisationId?: string | null,
	modelId?: string | null,
) {
	const routeParts = getModelRouteParts(modelId, organisationId);
	if (!routeParts) return null;

	return `/models/${encodeURIComponent(routeParts.organisationId)}/${encodeURIComponent(routeParts.routeSlug)}`;
}
