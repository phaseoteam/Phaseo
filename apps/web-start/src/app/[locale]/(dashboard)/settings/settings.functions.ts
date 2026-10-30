// Server data shared by the signed-in Settings area. Next read these in async
// server components (layout gate, flag-gated layouts and pages); here they are
// server functions, called from route beforeLoad hooks or read with
// useSuspenseQuery.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

/** Everything the settings layout needs: the signed-in gate, sidebar flags and the private scope. */
const loadSettingsLayout = createServerFn({ method: "GET" }).handler(async () => {
	const [{ fetchSettingsLayoutInitialData }, { getServerAccountContext }, flags] = await Promise.all([
		import("@/lib/fetchers/internal/fetchSettingsLayoutInitialData"),
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/flags"),
	]);
	const initialData = await fetchSettingsLayoutInitialData();
	const account = await getServerAccountContext();
	if (!initialData.signedIn) return { signedIn: false as const };
	const [showWebhooks, showEnterprise, showAutoRouting, showClassifiers, showSlackAgent, showWorkloadIdentity] = await Promise.all([
		flags.webhookSettingsEnabled(),
		flags.enterpriseSelfServePreviewEnabled(),
		flags.autoRoutingFlag(),
		flags.requestClassifiersFlag().catch(() => false),
		flags.slackAgentSettingsEnabled(),
		flags.workloadIdentityFlag().catch(() => false),
	]);
	return {
		signedIn: true as const,
		userId: account.userId,
		workspaceId: initialData.workspaceId,
		showBroadcast: initialData.showBroadcast,
		showWebhooks,
		showEnterprise,
		showAutoRouting,
		showClassifiers,
		showSlackAgent,
		showWorkloadIdentity,
		showInternal: initialData.accountContext?.isInternalAdmin === true,
		providerMode: initialData.accountContext?.providerMode === true,
	};
});

export type SettingsLayoutData = Awaited<ReturnType<typeof loadSettingsLayout>>;

export const settingsLayoutQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-layout"],
		queryFn: () => loadSettingsLayout(),
	});

/** The header account data the settings index and account pages use for provider-mode gates. */
export const getSettingsHeaderAccess = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchInternalAuthHeaderData } = await import("@/lib/fetchers/internal/fetchInternalAuthHeaderData");
	const account = await fetchInternalAuthHeaderData().catch(() => null);
	return { available: account !== null, providerMode: Boolean(account?.providerMode) };
});

/** Internal-admin status for pages that called requireInternalAdmin. */
export const getSettingsInternalAdminStatus = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchInternalAuthStatus } = await import("@/lib/fetchers/internal/fetchInternalAuthStatus");
	const status = await fetchInternalAuthStatus();
	return { signedIn: status.signedIn, isAdmin: status.isAdmin };
});

const SETTINGS_FLAGS = [
	"autoRouting",
	"batchApi",
	"enterpriseSelfServe",
	"modelSuccessorRedirect",
	"requestClassifiers",
	"slackAgent",
	"videoApi",
	"webhooks",
	"workloadIdentity",
] as const;

export type SettingsFlag = (typeof SETTINGS_FLAGS)[number];

/**
 * One feature flag. `safe` reproduces the pages that wrapped the flag in
 * `.catch(() => false)`; without it a flag failure still throws.
 */
export const getSettingsFlag = createServerFn({ method: "GET" })
	.validator((input: { name: SettingsFlag; safe?: boolean }) => {
		if (!SETTINGS_FLAGS.includes(input.name)) throw new Error(`Unknown settings flag: ${String(input.name)}`);
		return { name: input.name, safe: input.safe === true };
	})
	.handler(async ({ data }) => {
		const flags = await import("@/lib/flags");
		const read: Record<SettingsFlag, () => Promise<boolean>> = {
			autoRouting: () => flags.autoRoutingFlag(),
			batchApi: () => flags.batchApiFlag(),
			enterpriseSelfServe: () => flags.enterpriseSelfServePreviewEnabled(),
			modelSuccessorRedirect: () => flags.modelSuccessorRedirectFlag(),
			requestClassifiers: () => flags.requestClassifiersFlag(),
			slackAgent: () => flags.slackAgentSettingsEnabled(),
			videoApi: () => flags.videoApiFlag(),
			webhooks: () => flags.webhookSettingsEnabled(),
			workloadIdentity: () => flags.workloadIdentityFlag(),
		};
		const value = read[data.name]();
		return Boolean(data.safe ? await value.catch(() => false) : await value);
	});

export const settingsFlagQuery = (name: SettingsFlag, options: { safe?: boolean } = {}) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-flag", name, options.safe === true ? "safe" : "strict"],
		queryFn: () => getSettingsFlag({ data: { name, safe: options.safe } }),
	});
