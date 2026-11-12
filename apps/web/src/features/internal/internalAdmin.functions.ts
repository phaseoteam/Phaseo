// Internal admin area: the requireInternalAdmin gate as a server function for
// route beforeLoad hooks, plus the admin-only data the internal pages read.
// Every data function re-checks admin access itself, so admin data never
// reaches a visitor who skipped the route gate.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

/** Where a signed-in non-admin is sent. Only the two paths the pages used. */
export type InternalAdminForbiddenPath = "/" | "/internal";

function toForbiddenPath(value: unknown): InternalAdminForbiddenPath {
	return value === "/internal" ? "/internal" : "/";
}

/** Signed out → /sign-in, signed in without admin → forbiddenPath (same redirects as requireInternalAdmin). */
export const requireInternalAdminFn = createServerFn({ method: "GET" })
	.validator((forbiddenPath: InternalAdminForbiddenPath) => toForbiddenPath(forbiddenPath))
	.handler(async ({ data: forbiddenPath }) => {
		const { requireInternalAdmin } = await import("@/lib/auth/requireInternalAdmin");
		await requireInternalAdmin(forbiddenPath);
		return null;
	});

const getKeyIncidents = createServerFn({ method: "GET" }).handler(async () => {
	const [{ requireInternalAdmin }, { getServerAccountContext }, { fetchInternalWebApi }] = await Promise.all([
		import("@/lib/auth/requireInternalAdmin"),
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/web-api/client"),
	]);
	await requireInternalAdmin();
	const { accessToken } = await getServerAccountContext();
	return fetchInternalWebApi<{ incidents: import("@/features/internal/key-incidents/types").KeyIncident[] }>("/api/internal/key-incidents/list", accessToken);
});

export const keyIncidentsQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "key-incidents"],
		queryFn: () => getKeyIncidents(),
	});

const getRealtimeBillingReviews = createServerFn({ method: "GET" })
	.validator((input: { state: "open" | "resolved"; offset: number }) => ({
		state: input.state === "resolved" ? ("resolved" as const) : ("open" as const),
		offset: Math.min(10000, Math.max(0, Math.floor(Number(input.offset) || 0))),
	}))
	.handler(async ({ data: { state, offset } }) => {
		const [{ requireInternalAdmin }, { getServerAccountContext }, { fetchInternalWebApi }] = await Promise.all([
			import("@/lib/auth/requireInternalAdmin"),
			import("@/lib/fetchers/internal/serverAccountContext"),
			import("@/lib/web-api/client"),
		]);
		await requireInternalAdmin();
		const { accessToken } = await getServerAccountContext();
		return fetchInternalWebApi<{ reviews: import("@/features/internal/realtime-billing/types").Review[]; total: number }>(
			`/api/internal/realtime-billing/reviews?state=${state}&offset=${offset}`, accessToken);
	});

export const realtimeBillingReviewsQuery = (state: "open" | "resolved", offset: number) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "realtime-billing", state, offset],
		queryFn: () => getRealtimeBillingReviews({ data: { state, offset } }),
	});

const getSlackAgentInstallations = createServerFn({ method: "GET" })
	.validator((offset: number) => Math.min(100_000, Math.max(0, Math.floor(Number(offset) || 0))))
	.handler(async ({ data: offset }) => {
		const [{ requireInternalAdmin }, { getServerAccountContext }, { fetchInternalWebApi }] = await Promise.all([
			import("@/lib/auth/requireInternalAdmin"),
			import("@/lib/fetchers/internal/serverAccountContext"),
			import("@/lib/web-api/client"),
		]);
		await requireInternalAdmin();
		const { accessToken } = await getServerAccountContext();
		return fetchInternalWebApi<import("@/features/internal/slack-agent/types").SlackAgentInstallationsPage>(`/api/internal/slack-agent/installations?offset=${offset}`, accessToken);
	});

export const slackAgentInstallationsQuery = (offset: number) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "slack-agent-installations", offset],
		queryFn: () => getSlackAgentInstallations({ data: offset }),
	});

const getAuditModelsData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ requireInternalAdmin }, { getAuditModels }] = await Promise.all([
		import("@/lib/auth/requireInternalAdmin"),
		import("@/lib/fetchers/models/table-view/getAuditModels"),
	]);
	await requireInternalAdmin("/internal");
	return getAuditModels(true);
});

export const auditModelsQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "audit-models"],
		queryFn: () => getAuditModelsData(),
	});

const getProviderAuditData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ requireInternalAdmin }, { getProviderAudit }] = await Promise.all([
		import("@/lib/auth/requireInternalAdmin"),
		import("@/lib/fetchers/models/table-view/getProviderAudit"),
	]);
	await requireInternalAdmin("/internal");
	return getProviderAudit();
});

export const providerAuditQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "provider-audit"],
		queryFn: () => getProviderAuditData(),
	});

const getCreditGrants = createServerFn({ method: "GET" }).handler(async () => {
	const [{ requireInternalAdmin }, { fetchAdminCreditGrants }] = await Promise.all([
		import("@/lib/auth/requireInternalAdmin"),
		import("@/lib/fetchers/internal/fetchAdminCreditGrants"),
	]);
	await requireInternalAdmin("/internal");
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the page reads untyped grant rows
	return (await fetchAdminCreditGrants()) as any[];
});

export const creditGrantsQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "credit-grants"],
		queryFn: () => getCreditGrants(),
	});

/** Messages for the localisation preview header, in the previewed locale (as getTranslations({ locale }) resolved them). */
const getLocalisationPreviewMessages = createServerFn({ method: "GET" })
	.validator((locale: string) => locale)
	.handler(async ({ data: locale }) => {
		const { getLocale, getMessages } = await import("@/i18n/server");
		const { isPublicLocale } = await import("@/i18n/locales");
		const resolvedLocale = isPublicLocale(locale) ? locale : await getLocale();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a plain JSON message subtree
		const messages = (await getMessages({ locale: resolvedLocale })) as { Product?: { internalTools?: { localisationPreview?: any } } };
		return {
			locale: resolvedLocale as string,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a plain JSON message subtree
			messages: { Product: { internalTools: { localisationPreview: (messages.Product?.internalTools?.localisationPreview ?? {}) as any } } },
		};
	});

export const localisationPreviewMessagesQuery = (locale: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "localisation-preview-messages", locale],
		queryFn: () => getLocalisationPreviewMessages({ data: locale }),
		staleTime: Infinity,
	});
