import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { fetchSettingsLayoutInitialData } from "@/lib/fetchers/internal/fetchSettingsLayoutInitialData";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Suspense } from "react";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import { autoRoutingFlag, enterpriseSelfServePreviewEnabled, webhookSettingsEnabled } from "@/lib/flags";
import { connection } from "next/server";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { PrivateSettingsProvider } from "@/components/(gateway)/settings/PrivateSettingsQuery";

export const metadata = {
	title: "Settings",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await connection();
	const initialData = await fetchSettingsLayoutInitialData();
	const account = await getServerAccountContext();
	if (!initialData.signedIn) {
		const headerStore = await headers();
		const requestedPath =
			headerStore.get("x-invoke-path") ??
			headerStore.get("next-url") ??
			"/settings";
		const safeReturnUrl = requestedPath.startsWith("/")
			? requestedPath
			: "/settings";
		redirect(`/sign-in?returnUrl=${encodeURIComponent(safeReturnUrl)}`);
	}
	const showBroadcast = initialData.showBroadcast;
	let showWebhooks = false;
	const [webhooksEnabled, showEnterprise, showAutoRouting] = await Promise.all([
		webhookSettingsEnabled(),
		enterpriseSelfServePreviewEnabled(),
		autoRoutingFlag(),
	]);
	showWebhooks = webhooksEnabled;

	return (
		<>
			<NoFooterStyle />

			<SidebarProvider defaultOpen className="flex min-h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px)-1px)] overflow-visible">
				<Sidebar
					collapsible="icon"
					desktopClassName="hidden md:hidden lg:block"
					// Keep desktop sidebar fixed under sticky chrome (notice + header).
					className="top-[calc(var(--site-header-height,3.75rem)+var(--site-notice-height,0px)+1px)] bottom-0 h-auto bg-white dark:bg-zinc-950"
				>
					<SettingsSidebar showBroadcast={showBroadcast} showWebhooks={showWebhooks} showEnterprise={showEnterprise} showAutoRouting={showAutoRouting} showInternal={initialData.accountContext?.isInternalAdmin === true} providerMode={initialData.accountContext?.providerMode === true} />
				</Sidebar>
				<SidebarInset className="flex w-0 min-w-0 flex-1 flex-col overflow-visible bg-white dark:bg-zinc-950">
					<div className="container mx-auto flex min-h-full w-full flex-col px-4 sm:px-5 lg:px-6 xl:px-8">
						<div className="w-full flex-1 pb-4 pt-5">
							<Suspense fallback={<SettingsPageSkeleton />}>
								<PrivateSettingsProvider key={`${account.userId}:${initialData.workspaceId}`} scope={{ userId: account.userId ?? null, workspaceId: initialData.workspaceId }}>{children}</PrivateSettingsProvider>
							</Suspense>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</>
	);
}
