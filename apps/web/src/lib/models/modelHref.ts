export function getModelRouteSlug(modelId: string, organisationId: string) {
	const normalizedModelId = modelId.trim();
	const normalizedOrganisationId = organisationId.trim();

	if (!normalizedModelId || !normalizedOrganisationId) return "";

	const [firstSegment, ...restSegments] = normalizedModelId.split("/");
	if (
		restSegments.length > 0 &&
		firstSegment.toLowerCase() === normalizedOrganisationId.toLowerCase()
	) {
		return restSegments.join("/");
	}

	return normalizedModelId;
}

export function getModelDetailsHref(
	organisationId?: string | null,
	modelId?: string | null
) {
	if (!organisationId || !modelId) return null;

	const routeSlug = getModelRouteSlug(modelId, organisationId);
	if (!routeSlug) return null;

	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(routeSlug)}`;
}
