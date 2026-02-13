import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import SettingsSidebarTrigger from "@/components/(gateway)/settings/SettingsSidebarTrigger";
import SettingsTopTabsServer from "@/components/(gateway)/settings/SettingsTopTabsServer";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Suspense } from "react";

export const metadata = {
	title: "Settings",
};

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<>
			{/* Hide the global footer for settings pages without needing client-side route detection. */}
			<style>{`footer { display: none !important; }`}</style>

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
				<SettingsSidebar />
			</Sidebar>
			<SidebarInset className="bg-white dark:bg-zinc-950 flex flex-1 min-h-0 flex-col">
				<div className="container mx-auto flex w-full flex-col gap-3 px-2 py-4">
					<div className="shrink-0">
						<SettingsSidebarTrigger />
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
