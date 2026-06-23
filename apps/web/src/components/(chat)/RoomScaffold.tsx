"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Gauge, LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import { ChatSidebarModelsIcon } from "@/components/(chat)/ChatSidebarModelsIcon";
import { Button } from "@/components/ui/button";
import { fetchClientAuthHeaderData } from "@/lib/fetchers/internal/fetchClientAuthHeaderData";
import { postClientAuthSignOut } from "@/lib/fetchers/internal/postClientAuthSignOut";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";

type RoomScaffoldProps = {
	children: ReactNode;
};

type SidebarAuthUser = {
	id: string;
	email: string | null;
	name: string;
	avatarUrl: string | null;
};

export const ROOM_SIDEBAR_SLOT_ID = "room-scaffold-sidebar-slot";

function RoomSidebarBrand() {
	const { resolvedTheme } = useTheme();
	const { state: sidebarState, isMobile } = useSidebar();
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const isDarkTheme = resolvedTheme === "dark";
	const brandSrc = collapsed
		? isDarkTheme
			? "/logo_dark.svg"
			: "/logo_light.svg"
		: isDarkTheme
			? "/wordmark_dark.svg"
			: "/wordmark_light.svg";

	return (
		<Image
			src={brandSrc}
			alt="AI Stats"
			className={cn(
				"select-none object-contain",
				collapsed ? "h-7 w-7" : "h-8 w-auto max-w-[132px]",
			)}
			width={collapsed ? 28 : 132}
			height={32}
			priority
		/>
	);
}

const ROOM_SIDEBAR_MODELS_BUTTON = (
	<Button
		variant="ghost"
		asChild
		className="h-8 min-w-0 w-full flex-1 justify-start gap-0 px-2 text-sm font-medium group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
		aria-label="Models"
	>
		<Link
			href="/models"
			className="group/db flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center"
		>
			<ChatSidebarModelsIcon className="ml-1 group-data-[collapsible=icon]:ml-0" />
			<span className="truncate group-data-[collapsible=icon]:hidden">Models</span>
		</Link>
	</Button>
);

function RoomSidebarModelsButton() {
	const { state: sidebarState, isMobile } = useSidebar();
	const collapsed = sidebarState === "collapsed" && !isMobile;

	if (!collapsed) {
		return ROOM_SIDEBAR_MODELS_BUTTON;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{ROOM_SIDEBAR_MODELS_BUTTON}</TooltipTrigger>
			<TooltipContent side="right" align="center" sideOffset={10}>
				Models
			</TooltipContent>
		</Tooltip>
	);
}

export function RoomScaffold({ children }: RoomScaffoldProps) {
	const [hasCustomSidebarContent, setHasCustomSidebarContent] = useState(false);
	const [authUser, setAuthUser] = useState<SidebarAuthUser | null>(null);
	const [authLoading, setAuthLoading] = useState(true);

	const handleSignOut = useCallback(async () => {
		await postClientAuthSignOut();
		setAuthUser(null);
		window.location.href = "/sign-in";
	}, []);

	useEffect(() => {
		const slot = document.getElementById(ROOM_SIDEBAR_SLOT_ID);
		if (!slot) return;
		const updateHasContent = () => {
			setHasCustomSidebarContent(slot.childElementCount > 0);
		};
		updateHasContent();
		const observer = new MutationObserver(() => {
			updateHasContent();
		});
		observer.observe(slot, { childList: true });
		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		let mounted = true;
		const loadUser = async () => {
			setAuthLoading(true);
			try {
				const data = await fetchClientAuthHeaderData();
				if (!mounted) return;
				if (!data.isLoggedIn || !data.user) {
					setAuthUser(null);
					return;
				}
				setAuthUser({
					id: data.user.id,
					email: data.user.email,
					name: data.user.displayName ?? data.user.email ?? "Account",
					avatarUrl: data.user.avatarUrl,
				});
			} catch {
				if (mounted) setAuthUser(null);
			} finally {
				if (mounted) setAuthLoading(false);
			}
		};
		loadUser();
		return () => {
			mounted = false;
		};
	}, []);

	const nameParts = authUser?.name?.trim().split(" ").filter(Boolean) ?? [];
	const firstName = nameParts[0] ?? "Account";
	const initials = nameParts
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	return (
		<SidebarProvider defaultOpen contained className="h-full overflow-hidden">
			<Sidebar collapsible="icon" className="border-r border-border bg-background">
				<SidebarHeader className="h-[61px] gap-0 border-b border-border px-0 py-0">
					<div className="flex h-full w-full items-center gap-2 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pb-1">
						<Link
							href="/"
							className="flex min-w-0 items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto w-full"
							aria-label="AI Stats home"
						>
							<RoomSidebarBrand />
						</Link>
					</div>
				</SidebarHeader>
				<SidebarContent className="gap-0">
					<ChatRoomSwitcher />
					<SidebarSeparator className="my-0" />
					{!hasCustomSidebarContent ? (
						<>
							<div className="px-2 py-1.5">
								<RoomSidebarModelsButton />
							</div>
							<SidebarSeparator className="my-0" />
						</>
					) : null}
					<div
						id={ROOM_SIDEBAR_SLOT_ID}
						className="flex min-h-0 flex-1 flex-col gap-0"
					/>
				</SidebarContent>
				<SidebarFooter className="border-t border-border px-3 py-3">
					{authUser ? (
						<div className="grid gap-3">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										className="w-full justify-start gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
									>
										<Avatar className="h-8 w-8 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
											{authUser.avatarUrl ? (
												<AvatarImage
													src={authUser.avatarUrl}
													alt={authUser.name}
													className="object-cover"
												/>
											) : null}
											<AvatarFallback className="rounded-lg text-[11px] font-semibold">
												{initials || "U"}
											</AvatarFallback>
										</Avatar>
										<div className="flex min-w-0 flex-col items-start group-data-[collapsible=icon]:hidden">
											<span className="truncate text-sm font-medium">
												{firstName}
											</span>
										</div>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="right"
									align="start"
									sideOffset={8}
									className="w-56 z-[90]"
								>
									<DropdownMenuItem asChild>
										<Link href="/settings/account">
											<UserRound className="mr-2 h-4 w-4" />
											Account
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/gateway/usage">
											<Gauge className="mr-2 h-4 w-4" />
											Observability
										</Link>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={handleSignOut}>
										<LogOut className="mr-2 h-4 w-4" />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
							<p className="text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
								All data is stored locally in your browser.
							</p>
						</div>
					) : authLoading ? (
						<div className="h-9 w-full rounded-md bg-muted/40" />
					) : (
						<Button variant="ghost" className="w-full justify-start" asChild>
							<Link href="/sign-in">Sign in to chat</Link>
						</Button>
					)}
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="flex h-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
