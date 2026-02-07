import SettingsPageSkeleton from "@/components/(gateway)/settings/SettingsPageSkeleton";
import SettingsSidebar from "@/components/(gateway)/settings/Sidebar";
import SettingsSidebarTrigger from "@/components/(gateway)/settings/SettingsSidebarTrigger";
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
		<SidebarProvider defaultOpen className="min-h-0 flex-1">
			<Sidebar
				layout="inline"
				className="border-r border-border bg-sidebar text-sidebar-foreground h-full"
			>
				<SettingsSidebar />
			</Sidebar>
			<SidebarInset className="bg-white dark:bg-zinc-950 min-h-0">
				<div className="container mx-auto flex w-full flex-1 flex-col gap-4 px-2 py-4">
					<SettingsSidebarTrigger />
					<div className="flex-1 w-full p-3">
						<Suspense fallback={<SettingsPageSkeleton />}>
							{children}
						</Suspense>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
