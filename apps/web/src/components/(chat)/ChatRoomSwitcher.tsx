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
	moderation: BadgeCheck,
	embeddings: Sparkles,
};
const COMING_SOON_ROOMS = new Set<ChatRoomId>(["image", "video"]);

function isRoomActive(pathname: string, route: string): boolean {
	if (route === "/chat") {
		return pathname === "/chat";
	}
	return pathname.startsWith(route);
}

export function ChatRoomSwitcher() {
	const pathname = usePathname();
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
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className={cn(
										"h-8 gap-2 text-xs",
										collapsed
											? "w-8 justify-center px-0"
											: "w-full justify-between px-2",
									)}
									aria-label={activeRoom.label}
								>
									<span className="inline-flex items-center gap-2">
										<ActiveIcon className="h-3.5 w-3.5 shrink-0" />
										{!collapsed ? activeRoom.label : null}
									</span>
									{!collapsed ? (
										<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
									) : null}
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right" align="center" sideOffset={10}>
							{activeRoom.label}
						</TooltipContent>
					</Tooltip>
				) : (
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className={cn(
								"h-8 gap-2 text-xs",
								collapsed
									? "w-8 justify-center px-0"
									: "w-full justify-between px-2",
							)}
							aria-label={activeRoom.label}
						>
							<span className="inline-flex items-center gap-2">
								<ActiveIcon className="h-3.5 w-3.5 shrink-0" />
								{!collapsed ? activeRoom.label : null}
							</span>
							{!collapsed ? (
								<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
							) : null}
						</Button>
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
						const isComingSoon = COMING_SOON_ROOMS.has(room.id);
						if (isComingSoon) {
							return (
								<Tooltip key={room.id}>
									<TooltipTrigger asChild>
										<DropdownMenuItem
											onSelect={(event) => event.preventDefault()}
											className={cn(
												"cursor-not-allowed opacity-50 focus:bg-transparent focus:text-foreground",
												active ? "bg-muted/50" : "",
											)}
										>
											<span className="flex items-center gap-2">
												<Icon className="h-4 w-4" />
												<span>{room.label}</span>
											</span>
										</DropdownMenuItem>
									</TooltipTrigger>
									<TooltipContent side="right" align="center" sideOffset={10}>
										Coming Soon
									</TooltipContent>
								</Tooltip>
							);
						}
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
