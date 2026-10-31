import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { fetchFrontendOrganisationReleaseEvents } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/**
 * The visitor's time zone comes from request headers, so it is read on the
 * server. `now` is captured there too so SSR and hydration agree on "today".
 */
export const getRequestCalendarContext = createServerFn({ method: "GET" }).handler(async () => {
	const { headers } = await import("next/headers");
	const requestHeaders = await headers();
	return {
		timeZoneHeader:
			requestHeaders.get("x-vercel-ip-timezone") ??
			requestHeaders.get("cf-timezone") ??
			requestHeaders.get("x-time-zone"),
		now: new Date().toISOString(),
	};
});

export const requestCalendarContextQuery = () =>
	queryOptions({
		queryKey: ["request-calendar-context"],
		queryFn: () => getRequestCalendarContext(),
	});

export const organisationReleaseEventsQuery = (organisationId: string) =>
	queryOptions({
		queryKey: ["public-catalog", "organisation-release-events", organisationId],
		queryFn: () => fetchFrontendOrganisationReleaseEvents(organisationId),
	});
