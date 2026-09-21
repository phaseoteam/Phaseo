"use client";

import { type ReactNode } from "react";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import {
	MobileChatSidebarBrand,
	MobileChatSidebarTrigger,
} from "@/components/(chat)/MobileChatSidebarBrand";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
} from "@/components/ui/sidebar";

type RoomScaffoldProps = {
	children: ReactNode;
};

export const ROOM_SIDEBAR_SLOT_ID = "room-scaffold-sidebar-slot";

function RoomSidebarHeader() {
	return (
		<SidebarHeader className="h-[57px] gap-0 border-b border-border px-0 py-0">
			<div className="flex h-full min-w-0 items-center">
				<MobileChatSidebarBrand />
				<ChatRoomSwitcher className="min-w-0 flex-1" />
				<MobileChatSidebarTrigger />
			</div>
		</SidebarHeader>
	);
}

export function RoomScaffold({ children }: RoomScaffoldProps) {
	return (
		<SidebarProvider defaultOpen contained className="h-full min-w-0 overflow-hidden">
			<Sidebar collapsible="icon" className="border-r border-border bg-background">
				<RoomSidebarHeader />
				<SidebarContent className="gap-0">
					<div
						id={ROOM_SIDEBAR_SLOT_ID}
						className="flex min-h-0 flex-1 flex-col gap-0"
					/>
				</SidebarContent>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="flex h-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
