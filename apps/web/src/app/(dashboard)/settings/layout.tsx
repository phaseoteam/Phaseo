import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import SettingsTopTabsServer from "@/components/(gateway)/settings/SettingsTopTabsServer";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Suspense } from "react";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import { fetchSettingsLayoutInitialData } from "@/lib/fetchers/internal/fetchSettingsLayoutInitialData";

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

	return (
		<>
			<NoFooterStyle />

			<SidebarProvider
				defaultOpen
				contained
				className="flex min-h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px))] flex-1"
			>
				<Sidebar
					desktopClassName="hidden lg:block"
					// Keep desktop sidebar fixed under sticky chrome (notice + header).
					className="top-[calc(var(--site-header-height,3.75rem)+var(--site-notice-height,0px))] bottom-0 h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px))] bg-white dark:bg-zinc-950"
				>
					<SettingsSidebar showBroadcast={initialData.showBroadcast} />
				</Sidebar>
				<SidebarInset className="bg-white dark:bg-zinc-950 flex flex-1 min-h-0 flex-col">
					<div className="flex min-h-0 w-full flex-1 flex-col">
						<div className="shrink-0 border-b border-border px-4 pb-3 pt-4 lg:flex lg:h-12 lg:items-center lg:px-6 lg:py-0">
							<SettingsTopTabsServer
								isEnterpriseInvoiceMode={initialData.isEnterpriseInvoiceMode}
							/>
						</div>
						<div className="container mx-auto w-full px-4 py-6 lg:px-6">
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
