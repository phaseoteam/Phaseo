"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
} from "@/components/ui/sidebar";

type RoomScaffoldProps = {
	children: ReactNode;
};

export function RoomScaffold({ children }: RoomScaffoldProps) {
	return (
		<SidebarProvider defaultOpen className="h-dvh overflow-hidden">
			<Sidebar className="border-r border-border bg-background">
				<SidebarHeader className="gap-0 px-0 pt-3.5 pb-0">
					<div className="mb-3.5 ml-2 flex w-full items-center gap-2 px-2">
						<Link href="/">
							<img
								src="/wordmark_light.svg"
								alt="AI Stats"
								className="h-8 select-none dark:hidden"
							/>
							<img
								src="/wordmark_dark.svg"
								alt="AI Stats"
								className="hidden h-8 select-none dark:block"
							/>
						</Link>
					</div>
					<div className="mb-2 h-px w-full bg-border" />
				</SidebarHeader>
				<SidebarContent>
					<ChatRoomSwitcher />
					<SidebarSeparator className="my-0" />
					<div className="px-2 pt-2 pb-0">
						<Button
							variant="ghost"
							asChild
							className="min-w-0 w-full flex-1 justify-start pr-2 truncate"
						>
							<Link href="/">
								<Database className="mr-2 h-4 w-4" />
								Database
							</Link>
						</Button>
					</div>
				</SidebarContent>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="flex h-dvh min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
