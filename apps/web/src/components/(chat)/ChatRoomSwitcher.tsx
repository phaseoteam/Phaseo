"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
	AudioLines,
	ArrowUpDown,
	BadgeCheck,
	ChevronsUpDown,
	Scale,
	GitMerge,
	ImageIcon,
	Mic,
	MessageSquareText,
	Music2,
	Radio,
	ScanText,
	Sparkles,
	Subtitles,
	Video,
} from "lucide-react";
import { CHAT_ROOMS, type ChatRoomId } from "@/lib/chat/rooms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useChatFeatureFlags } from "@/components/(chat)/ChatFeatureFlags";

const ICONS: Record<ChatRoomId, ComponentType<{ className?: string }>> = {
	text: MessageSquareText,
	fusion: GitMerge,
	image: ImageIcon,
	video: Video,
	audio: AudioLines,
	speech: Mic,
	"speech-to-text": Subtitles,
	music: Music2,
	realtime: Radio,
	moderation: BadgeCheck,
	embeddings: Sparkles,
	ocr: ScanText,
	rerank: ArrowUpDown,
	decisions: Scale,
};

const DISABLED_ROOMS = new Set<ChatRoomId>(["ocr", "rerank"]);

function isRoomActive(pathname: string, route: string): boolean {
	if (route === "/chat") {
		return pathname === "/chat";
	}
	return pathname === route || pathname.startsWith(`${route}/`);
}

export function ChatRoomSwitcher({ className }: { className?: string } = {}) {
	const { realtimeEnabled, videoEnabled } = useChatFeatureFlags();
	const pathname = usePathname() ?? "/chat";
	const { state: sidebarState, isMobile } = useSidebar();
	const availableRooms = CHAT_ROOMS;
	const activeRoom =
		availableRooms.find((room) => isRoomActive(pathname, room.route)) ??
		availableRooms[0] ??
		CHAT_ROOMS[0];
	const ActiveIcon = ICONS[activeRoom.id];
	const collapsed = sidebarState === "collapsed" && !isMobile;

	return (
		<div className={cn("px-2 py-1.5", className)}>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger render={<Button
								variant="ghost"
								className="relative h-8 w-full min-w-0 justify-start gap-0 overflow-hidden rounded-md px-2 text-sm font-medium group-data-[state=collapsed]:rounded-full"
								aria-label={activeRoom.label} />}>

								<ActiveIcon className="h-4 w-4 shrink-0" />
								<span className="ml-2 inline-flex min-w-0 items-center gap-2 whitespace-nowrap group-data-[collapsible=icon]:hidden">
									<span>
										{activeRoom.label}
									</span>
									{activeRoom.beta ? (
										<Badge
											variant="outline"
										className="h-4 rounded-[4px]! px-1.5 text-[10px] font-medium"
										>
											Beta
										</Badge>
									) : null}
								</span>
								<ChevronsUpDown className="absolute right-2 h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />

						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent
						side="right"
						align="center"
						sideOffset={10}
						hidden={!collapsed || isMobile}
					>
						{activeRoom.label}
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					side={collapsed ? "right" : "bottom"}
					align="start"
					sideOffset={8}
					className={cn(
						"z-[90] space-y-1 rounded-md [&_[data-slot=dropdown-menu-item]]:rounded-md",
						collapsed && "w-56",
					)}
				>
					{availableRooms.map((room) => {
						const Icon = ICONS[room.id];
						const active = isRoomActive(pathname, room.route);
						const disabled =
							DISABLED_ROOMS.has(room.id) ||
							(room.id === "video" && !videoEnabled) ||
							(room.id === "realtime" && !realtimeEnabled);
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
												<Badge
													variant="outline"
											className="ml-auto h-4 rounded-[4px]! px-1.5 text-[10px] font-medium"
												>
													Coming soon
												</Badge>
											</DropdownMenuItem>
										</div>
									</TooltipTrigger>
									<TooltipContent side="right" align="center">
										Coming soon
									</TooltipContent>
								</Tooltip>
							);
						}
						return (
							<DropdownMenuItem
								key={room.id}
								className={cn(active ? "bg-muted" : "")}
								render={<Link href={room.route} className="flex items-center gap-2" />}
							>

									<Icon className="h-4 w-4" />
									<span>{room.label}</span>
									{room.beta ? (
										<Badge variant="outline" className="ml-auto h-4 rounded-[4px]! px-1.5 text-[10px] font-medium">
											Beta
										</Badge>
									) : null}

							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
