"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
	AudioLines,
	BadgeCheck,
	ChevronsUpDown,
	ImageIcon,
	Mic,
	MessageSquareText,
	Music2,
	Radio,
	Sparkles,
	Subtitles,
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const ICONS: Record<ChatRoomId, ComponentType<{ className?: string }>> = {
	text: MessageSquareText,
	image: ImageIcon,
	video: Video,
	audio: AudioLines,
	speech: Mic,
	"speech-to-text": Subtitles,
	music: Music2,
	realtime: Radio,
	moderation: BadgeCheck,
	embeddings: Sparkles,
};

const DISABLED_ROOMS = new Set<ChatRoomId>(["realtime"]);

function isRoomActive(pathname: string, route: string): boolean {
	if (route === "/chat") {
		return pathname === "/chat";
	}
	return pathname === route || pathname.startsWith(`${route}/`);
}

export function ChatRoomSwitcher() {
	const pathname = usePathname() ?? "/chat";
	const { state: sidebarState, isMobile } = useSidebar();
	const activeRoom =
		CHAT_ROOMS.find((room) => isRoomActive(pathname, room.route)) ??
		CHAT_ROOMS[0];
	const ActiveIcon = ICONS[activeRoom.id];
	const collapsed = sidebarState === "collapsed" && !isMobile;

	return (
		<div className="px-2 py-1.5">
			<DropdownMenu>
				{collapsed ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger render={<Button
									variant="ghost"
									className={cn(
										"h-8 gap-0 px-2 text-sm font-medium",
										collapsed
											? "w-8 justify-center px-0"
											: "w-full justify-between px-2",
									)}
									aria-label={activeRoom.label} />}>

									<span className="inline-flex items-center gap-2">
										<ActiveIcon className="h-4 w-4 shrink-0" />
										{!collapsed ? activeRoom.label : null}
									</span>
									{!collapsed ? (
										<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
									) : null}

							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right" align="center" sideOffset={10}>
							{activeRoom.label}
						</TooltipContent>
					</Tooltip>
				) : (
					<DropdownMenuTrigger render={<Button
							variant="ghost"
							className={cn(
								"h-8 gap-0 px-2 text-sm font-medium",
								collapsed
									? "w-8 justify-center px-0"
									: "w-full justify-between px-2",
							)}
							aria-label={activeRoom.label} />}>

							<span className="inline-flex items-center gap-2">
								<ActiveIcon className="h-4 w-4 shrink-0" />
								{!collapsed ? activeRoom.label : null}
							</span>
							{!collapsed ? (
								<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
							) : null}

					</DropdownMenuTrigger>
				)}
				<DropdownMenuContent
					side={collapsed ? "right" : "bottom"}
					align="start"
					sideOffset={8}
					className="z-[90] w-56"
				>
					{CHAT_ROOMS.map((room) => {
						const Icon = ICONS[room.id];
						const active = isRoomActive(pathname, room.route);
						const disabled = DISABLED_ROOMS.has(room.id);
						if (disabled) {
							return (
								<Tooltip key={room.id}>
									<TooltipTrigger asChild>
										<div>
											<DropdownMenuItem
												disabled
												className="cursor-not-allowed opacity-60"
											>
												<Icon className="h-4 w-4" />
												<span>{room.label}</span>
											</DropdownMenuItem>
										</div>
									</TooltipTrigger>
									<TooltipContent side="right" align="center">
										Coming Soon
									</TooltipContent>
								</Tooltip>
							);
						}
						return (
							<DropdownMenuItem
								key={room.id}
								className={cn(active ? "bg-muted" : "")}
							 render={<Link href={room.route} className="flex items-center gap-2" />}>

									<Icon className="h-4 w-4" />
									<span>{room.label}</span>

							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
