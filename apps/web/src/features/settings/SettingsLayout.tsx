import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Suspense } from "react";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import { getSettingsMessages } from "@/i18n/settings";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { PrivateSettingsProvider } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { settingsLayoutQuery } from "./settings.functions";

export async function getSettingsLayoutMetadata({ params }: RouteMetadataInput) {
	const { locale } = params;
	const messages = getSettingsMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	return { title: messages.pages.settings, robots: { index: false, follow: false } };
}

// The signed-out redirect to sign-in runs in the route's beforeLoad
// (routes/{-$locale}/_dashboard/settings/route.tsx), which also loads this query.
export default function SettingsLayout() {
	const { data } = useSuspenseQuery(settingsLayoutQuery());
	if (!data.signedIn) return null;

	return (
		<>
			<NoFooterStyle />

			<SidebarProvider defaultOpen className="flex min-h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px)-1px)] overflow-visible">
				<Sidebar
					collapsible="icon"
					desktopClassName="hidden md:hidden lg:block"
					// Keep desktop sidebar fixed under sticky chrome (notice + header).
					className="top-[calc(var(--site-header-height,3.75rem)+var(--site-notice-height,0px)+1px)] bottom-0 h-auto bg-background"
				>
					<SettingsSidebar {...data} />
				</Sidebar>
				<SidebarInset className="flex w-0 min-w-0 flex-1 flex-col overflow-visible bg-background">
					<div className="container mx-auto flex min-h-full min-w-0 w-full flex-col px-4 sm:px-5 lg:px-6 xl:px-8">
						<div className="min-w-0 w-full flex-1 pb-8 pt-5 [&>*]:mx-auto">
							<Suspense fallback={<SettingsPageSkeleton />}>
								<PrivateSettingsProvider key={`${data.userId}:${data.workspaceId}`} scope={{ userId: data.userId ?? null, workspaceId: data.workspaceId }}>
									<Outlet />
								</PrivateSettingsProvider>
							</Suspense>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</>
	);
}
