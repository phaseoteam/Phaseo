import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import SettingsTopTabsServer from "@/components/(gateway)/settings/SettingsTopTabsServer";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Suspense } from "react";
import HideGlobalFooter from "@/components/layout/HideGlobalFooter";

export const metadata = {
	title: "Settings",
};

export default async function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const userId = authData.user?.id ?? null;
	const teamId = await getTeamIdFromCookie();
	let showBroadcast = false;
	if (userId && teamId) {
		const { data: membership } = await supabase
			.from("team_members")
			.select("role")
			.eq("team_id", teamId)
			.eq("user_id", userId)
			.maybeSingle();
		showBroadcast = (membership?.role ?? "").toLowerCase() === "admin";
	}

	return (
		<>
			<HideGlobalFooter />

			<SidebarProvider
				contained
				defaultOpen
				className="flex flex-1 min-h-0"
			>
				<Sidebar
					// Use shadcn's fixed desktop sidebar so it does not move when the page scrolls.
					// Offset by the sticky site header height (navbar + announcement bar).
					className="top-[6.25rem] h-auto bg-white dark:bg-zinc-950"
				>
					<SettingsSidebar showBroadcast={showBroadcast} />
				</Sidebar>
				<SidebarInset className="bg-white dark:bg-zinc-950 flex flex-1 min-h-0 flex-col">
					<div className="container mx-auto flex w-full flex-col gap-3 px-2 py-4">
						<div className="shrink-0">
							<div className="mt-2.5">
								<SettingsTopTabsServer />
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
