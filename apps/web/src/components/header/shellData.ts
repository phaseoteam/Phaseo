// Server data the site shell needs on every page: the signed-in account
// (header, notices, search) and the capability flags that gate menu items.
// One server function loads them once per request and the shell reads it
// with useSuspenseQuery.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { defaultLocale, isPublicLocale } from "@/i18n/locales";

const loadShellData = createServerFn({ method: "GET" })
	.validator((locale: string) => (isPublicLocale(locale) ? locale : defaultLocale))
	.handler(async ({ data: locale }) => {
		const [{ getHeaderAccountData }, flags, { catalogueGamesEnabled }, { getPublicMessages }, { getSettingsNavigationMessages }, { getSettingsNavigationCopy }] = await Promise.all([
			import("./getHeaderAccountData"),
			import("@/lib/flags"),
			import("@/lib/games/preview"),
			import("@/i18n/messages"),
			import("@/i18n/settings-navigation-messages"),
			import("@/components/(gateway)/settings/Sidebar.labels"),
		]);
		const [account, autoRouting, classifiers, workloadIdentity, slackAgent, enterprise, webhooks, video, realtime, games, messages, navigationMessages] = await Promise.all([
			getHeaderAccountData(),
			flags.autoRoutingFlag().catch(() => false),
			flags.requestClassifiersFlag().catch(() => false),
			flags.workloadIdentityFlag().catch(() => false),
			flags.slackAgentSettingsEnabled().catch(() => false),
			flags.enterpriseSelfServePreviewEnabled().catch(() => false),
			flags.batchApiFlag().catch(() => false),
			flags.videoApiFlag().catch(() => false),
			flags.realtimeVoiceFlag().catch(() => false),
			catalogueGamesEnabled().catch(() => false),
			getPublicMessages(locale),
			getSettingsNavigationMessages(locale),
		]);
		return {
			account,
			capabilities: { autoRouting, classifiers, workloadIdentity, slackAgent, enterprise, webhooks, video, realtime, games },
			settingsNavigationCopy: getSettingsNavigationCopy(navigationMessages, messages.SettingsUI.sidebarNew),
		};
	});

export type ShellData = Awaited<ReturnType<typeof loadShellData>>;

export const shellDataQuery = (locale: string) =>
	queryOptions({
		queryKey: ["site-shell", locale],
		queryFn: () => loadShellData({ data: locale }),
		staleTime: 60_000,
	});
