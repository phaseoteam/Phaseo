"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
	AudioLines,
	BadgeCheck,
	ChevronsUpDown,
	ImageIcon,
	MessageSquareText,
	Sparkles,
	Video,
} from "lucide-react";
import { CHAT_ROOMS, type ChatRoomId } from "@/lib/chat/rooms";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONS: Record<ChatRoomId, ComponentType<{ className?: string }>> = {
	text: MessageSquareText,
	image: ImageIcon,
	video: Video,
	audio: AudioLines,
	moderation: BadgeCheck,
	embeddings: Sparkles,
};

function isRoomActive(pathname: string, route: string): boolean {
	if (route === "/chat") {
		return pathname === "/chat";
	}
	return pathname.startsWith(route);
}

export function ChatRoomSwitcher() {
	const pathname = usePathname();
	const activeRoom =
		CHAT_ROOMS.find((room) => isRoomActive(pathname, room.route)) ??
		CHAT_ROOMS[0];
	const ActiveIcon = ICONS[activeRoom.id];

	return (
		<div className="px-2 pb-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="w-full justify-between gap-2 px-2 text-xs"
					>
						<span className="inline-flex items-center gap-2">
							<ActiveIcon className="h-3.5 w-3.5 shrink-0" />
							{activeRoom.label}
						</span>
						<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{CHAT_ROOMS.map((room) => {
						const Icon = ICONS[room.id];
						const active = isRoomActive(pathname, room.route);
						return (
							<DropdownMenuItem
								key={room.id}
								asChild
								className={cn(active ? "bg-muted" : "")}
							>
								<Link href={room.route} className="flex items-center gap-2">
									<Icon className="h-4 w-4" />
									<span>{room.label}</span>
								</Link>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
