import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { fetchFrontendOrganisationReleaseEvents } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/**
 * The visitor's time zone comes from request headers, so it is read on the
 * server. `now` is captured there too so SSR and hydration agree on "today".
 */
export const getRequestCalendarContext = createServerFn({ method: "GET" }).handler(async () => {
	const { getRequest, getRequestHeaders } = await import("@tanstack/react-start/server");
	const requestHeaders = getRequestHeaders();
	// Cloudflare exposes the visitor's time zone as request.cf.timezone; the
	// request middleware does not copy it to a header, so read it from cf too.
	const cf = (getRequest() as Request & { cf?: { timezone?: string } }).cf;
	return {
		timeZoneHeader: cf?.timezone ?? requestHeaders.get("cf-timezone") ?? requestHeaders.get("x-time-zone"),
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
