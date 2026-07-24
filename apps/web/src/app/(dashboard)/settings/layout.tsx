import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import SettingsTopTabsServer from "@/components/(gateway)/settings/SettingsTopTabsServer";
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
import { batchApiFlag } from "@/lib/flags";

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
	const initialData = await fetchSettingsLayoutInitialData();
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
	const isEnterpriseInvoiceMode = initialData.isEnterpriseInvoiceMode;
	showWebhooks = await batchApiFlag();

	return (
		<>
			<NoFooterStyle />

			<SidebarProvider defaultOpen className="flex flex-1 min-h-0">
				<Sidebar
					collapsible="icon"
					desktopClassName="hidden lg:block"
					// Keep desktop sidebar fixed under sticky chrome (notice + header).
					className="top-[calc(var(--site-header-height,4rem)+var(--site-notice-height,0px))] bottom-0 h-auto bg-white dark:bg-zinc-950"
				>
					<SettingsSidebar showBroadcast={showBroadcast} showWebhooks={showWebhooks} />
				</Sidebar>
				<SidebarInset className="bg-white dark:bg-zinc-950 flex flex-1 min-h-0 flex-col">
					<div className="container mx-auto flex w-full flex-col gap-3 px-2 py-4">
						<div className="shrink-0">
							<div className="mt-2.5">
								<SettingsTopTabsServer
									isEnterpriseInvoiceMode={isEnterpriseInvoiceMode}
									showBroadcast={showBroadcast}
									showWebhooks={showWebhooks}
								/>
							</div>
						</div>
						<div className="w-full pt-2">
							<Suspense fallback={<SettingsPageSkeleton />}>
								{children}
							</Suspense>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</>
	);
}
