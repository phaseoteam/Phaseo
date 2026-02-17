"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, PanelLeftClose } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function SettingsSidebar({
	children,
	showBroadcast = true,
}: {
	/**
	 * Optional slot for lightweight, non-blocking sidebar adornments (e.g. alert counts).
	 * This is rendered next to the "Usage" item label.
	 */
	children?: ReactNode;
	showBroadcast?: boolean;
}) {
	const pathname = usePathname();
	const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
	const navGroups = getSettingsSidebar({ showBroadcast });

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
			<SidebarGroup className="pt-0">
				{heading ? <SidebarGroupLabel>{heading}</SidebarGroupLabel> : null}
				<SidebarGroupContent>
					<SidebarMenu>
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
						className="h-4 w-4 shrink-0 text-muted-foreground"
					/>
				) : null}
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				{item.badge && (
					<Badge
						variant="outline"
						className="ml-auto h-5 px-1.5 text-[10px] uppercase tracking-wide"
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
			<SidebarHeader className="gap-0 px-2 pt-6 flex-shrink-0">
				<div className="flex items-center gap-2 px-2 pb-3">
					<div className="text-sm font-semibold text-foreground">
						Settings
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto md:hidden"
						onClick={toggleSidebar}
						aria-label="Close sidebar"
					>
						<PanelLeftClose className="h-4 w-4" />
					</Button>
				</div>
				<div className="h-px w-full bg-border" />
			</SidebarHeader>
			{/* Mobile can scroll the menu if needed; desktop stays fixed (no sidebar scroll). */}
			<SidebarContent className="overflow-y-auto md:overflow-y-hidden">
				<div className="pb-4">
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
