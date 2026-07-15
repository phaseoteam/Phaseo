"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, PanelLeftClose } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";

import type { NavGroup, NavItem } from "./Sidebar.config";
import { getSettingsSidebar } from "./Sidebar.config";

function getBadgeClassName(badge: string) {
	return cn(
		"ml-auto h-5 shrink-0 px-1.5 text-[10px] font-semibold tracking-normal",
		badge === "Beta" &&
			"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
		badge === "Alpha" &&
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
		badge !== "Beta" &&
			badge !== "Alpha" &&
			"border-border bg-transparent text-muted-foreground",
	);
}

export default function SettingsSidebar({
	children,
	showBroadcast = true,
	showWebhooks = true,
}: {
	/**
	 * Optional slot for lightweight, non-blocking sidebar adornments (e.g. alert counts).
	 * This is rendered next to the "Usage" item label.
	 */
	children?: ReactNode;
	showBroadcast?: boolean;
	showWebhooks?: boolean;
}) {
	const pathname = usePathname();
	const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
	const navGroups = getSettingsSidebar({ showBroadcast, showWebhooks });

	function matchScore(item: NavItem) {
		const path = pathname ?? "";
		if (item.disabled || item.external) return null;

		if (path === item.href) return { exact: true, len: item.href.length };
		if (path.startsWith(item.href + "/"))
			return { exact: true, len: item.href.length };

		let best = 0;
		for (const prefix of item.match ?? []) {
			if (path === prefix || path.startsWith(prefix + "/")) {
				best = Math.max(best, prefix.length);
			}
		}
		if (best > 0) return { exact: false, len: best };
		return null;
	}

	const allItems: NavItem[] = navGroups.flatMap((g) => g.items);
	const activeItem =
		allItems
			.map((item) => ({ item, score: matchScore(item) }))
			.filter((x) => x.score !== null)
			.sort((a, b) => {
				// Prefer exact matches over "match prefix" matches, then longest match.
				if (a.score!.exact !== b.score!.exact)
					return a.score!.exact ? -1 : 1;
				return b.score!.len - a.score!.len;
			})[0]?.item ?? null;

	const closeMobile = () => {
		if (isMobile) setOpenMobile(false);
	};

	function NavBlock({ group }: { group: NavGroup }) {
		const heading = (group.heading ?? "").trim();
		return (
			<SidebarGroup className="px-2 py-1.5">
				{heading ? (
					<SidebarGroupLabel className="h-6 px-2 text-xs font-medium tracking-normal text-muted-foreground">
						{heading}
					</SidebarGroupLabel>
				) : null}
				<SidebarGroupContent>
					<SidebarMenu className="gap-0.5">
						{group.items.map((item) => (
							<SidebarMenuItem
								key={`${heading || "group"}-${item.href}`}
							>
								{renderNavItem(item)}
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		);
	}

	function renderNavItem(item: NavItem) {
		const active =
			!item.disabled && !item.external && activeItem?.href === item.href;

		const Icon = item.icon;
		const content = (
			<>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className="h-4 w-4 shrink-0 text-muted-foreground/85"
					/>
				) : null}
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				{item.badge && (
					<Badge
						variant="outline"
						className={getBadgeClassName(item.badge)}
					>
						{item.badge}
					</Badge>
				)}
				{item.href === "/settings/usage" ? children : null}
				{item.external && (
					<ExternalLink
						aria-hidden="true"
						className="ml-2 h-4 w-4 shrink-0 text-muted-foreground"
					/>
				)}
			</>
		);

		if (item.disabled) {
			return (
				<SidebarMenuButton
					disabled
					aria-disabled="true"
					className="cursor-not-allowed"
				>
					{content}
				</SidebarMenuButton>
			);
		}

		if (item.external) {
			return (
				<SidebarMenuButton asChild>
					<a
						href={item.href}
						target="_blank"
						rel="noreferrer"
						aria-label={`${item.label} (opens in a new tab)`}
						onClick={closeMobile}
					>
						{content}
					</a>
				</SidebarMenuButton>
			);
		}

		return (
			<SidebarMenuButton asChild isActive={active}>
				<Link
					href={item.href}
					prefetch={false}
					aria-current={active ? "page" : undefined}
					onClick={closeMobile}
				>
					{content}
				</Link>
			</SidebarMenuButton>
		);
	}

	return (
		<>
			<SidebarHeader className="relative h-12 flex-shrink-0 gap-0 px-0 py-0">
				<div className="flex h-12 items-center gap-2 px-4">
					<div className="-translate-y-px text-sm font-semibold text-foreground">
						Settings
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto lg:hidden"
						onClick={toggleSidebar}
						aria-label="Close sidebar"
					>
						<PanelLeftClose className="h-4 w-4" />
					</Button>
				</div>
				<div className="absolute inset-x-0 bottom-0 h-px bg-border" />
			</SidebarHeader>
			<SidebarContent className="overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
				<div className="pb-5 pt-0">
					{navGroups.map((group, idx) => (
						<div key={`${group.heading ?? "group"}-${idx}`}>
							<NavBlock group={group} />
						</div>
					))}
				</div>
			</SidebarContent>
		</>
	);
}
