// Old model sub-pages (/models/<org>/<model>/<anything>) redirect permanently
// to the canonical model overview, keeping the locale prefix and query string.
import { createFileRoute } from "@tanstack/react-router";
import { defaultLocale, isPublicLocale } from "@/i18n/locales";
import { redirectLegacyModelPath } from "@/features/models/organisationId/modelId/redirectLegacyModelPath";

export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId/$")({
	loader: ({ params, location }) =>
		redirectLegacyModelPath(
			{
				organisationId: params.organisationId,
				modelId: params.modelId,
				locale: params.locale && isPublicLocale(params.locale) ? params.locale : defaultLocale,
			},
			location.search as Record<string, string | string[]>,
		),
});
