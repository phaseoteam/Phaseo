// Signed-in viewer data the catalogue pages read (admin edit buttons, workspace
// policy notices, workspace privacy settings, account query scope). All of it
// needs the request cookies, so it is loaded through server functions. Keys
// carry no account id: the server resolves the account from the session, and
// the browser query client only ever holds one session.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { InternalAuthStatus } from "@/lib/fetchers/internal/authTypes";

const catalogueViewerRoot = ["phaseo-web", "catalogue-viewer"] as const;

const SIGNED_OUT_STATUS: InternalAuthStatus = { isAdmin: false, role: null, signedIn: false };

const getCatalogueInternalAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchInternalAuthStatus } = await import("@/lib/fetchers/internal/fetchInternalAuthStatus");
	return fetchInternalAuthStatus().catch(() => SIGNED_OUT_STATUS);
});

/** `fetchInternalAuthStatus()`; failures resolve to a signed-out status. */
export const catalogueInternalAuthStatusQuery = () =>
	queryOptions({
		queryKey: [...catalogueViewerRoot, "internal-auth-status"] as const,
		queryFn: () => getCatalogueInternalAuthStatus().catch(() => SIGNED_OUT_STATUS),
	});

/** Same rule as `isAdminViewer()` in `@/lib/auth/getViewerRole`. */
export function isAdminViewerStatus(status: InternalAuthStatus): boolean {
	return (status.signedIn ? status.role ?? null : null) === "admin";
}

const getCatalogueChatEffectivePolicy = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchChatEffectivePolicy } = await import("@/lib/fetchers/internal/fetchChatEffectivePolicy");
	return fetchChatEffectivePolicy().catch(() => null);
});

/** `fetchChatEffectivePolicy()`; failures resolve to null. */
export const catalogueChatEffectivePolicyQuery = () =>
	queryOptions({
		queryKey: [...catalogueViewerRoot, "chat-effective-policy"] as const,
		queryFn: () => getCatalogueChatEffectivePolicy().catch(() => null),
	});

const getCatalogueWorkspacePrivacySettings = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchWorkspacePrivacySettings } = await import("@/lib/fetchers/internal/fetchWorkspacePrivacySettings");
	return fetchWorkspacePrivacySettings();
});

/** Raw `fetchWorkspacePrivacySettings()` (errors propagate; callers add their own fallback). */
export const catalogueWorkspacePrivacySettingsQuery = () =>
	queryOptions({
		queryKey: [...catalogueViewerRoot, "workspace-privacy-settings"] as const,
		queryFn: () => getCatalogueWorkspacePrivacySettings(),
	});

const getCatalogueAccountQueryScope = createServerFn({ method: "GET" }).handler(async () => {
	const [{ getServerAccountContext }, { toAccountQueryScope }] = await Promise.all([
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/query/queryKeys"),
	]);
	return toAccountQueryScope(await getServerAccountContext());
});

/** `toAccountQueryScope(await getServerAccountContext())`. */
export const catalogueAccountQueryScopeQuery = () =>
	queryOptions({
		queryKey: [...catalogueViewerRoot, "account-query-scope"] as const,
		queryFn: () => getCatalogueAccountQueryScope(),
	});
