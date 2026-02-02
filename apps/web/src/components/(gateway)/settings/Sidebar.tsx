"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, PanelLeftClose } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";

import type { NavGroup, NavItem } from "./Sidebar.config";
import { SETTINGS_SIDEBAR } from "./Sidebar.config";

export default function SettingsSidebar() {
	const pathname = usePathname();
	const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();

	const allItems: NavItem[] = SETTINGS_SIDEBAR.flatMap((g) => g.items);
	const activeItem =
		allItems
			.filter((item) => !item.disabled && !item.external)
			.sort((a, b) => b.href.length - a.href.length)
			.find(
				(item) =>
					pathname === item.href ||
					pathname?.startsWith(item.href + "/"),
			) ?? null;

	const closeMobile = () => {
		if (isMobile) setOpenMobile(false);
	};

	function NavBlock({ group }: { group: NavGroup }) {
		return (
			<SidebarGroup className="pt-0">
				<SidebarGroupLabel>{group.heading}</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						{group.items.map((item) => (
							<SidebarMenuItem
								key={`${group.heading}-${item.href}`}
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

		const content = (
			<>
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				{item.badge && (
					<Badge
						variant="outline"
						className="ml-auto h-5 px-1.5 text-[10px] uppercase tracking-wide"
					>
						{item.badge}
					</Badge>
				)}
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
			<SidebarHeader className="gap-0 px-2 pt-6">
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
			<SidebarContent>
				<ScrollArea className="h-full">
					<div className="pb-4">
						{SETTINGS_SIDEBAR.map((group, idx) => (
							<div key={group.heading}>
								<NavBlock group={group} />
								{idx < SETTINGS_SIDEBAR.length - 1 && (
									<SidebarSeparator className="my-2" />
								)}
							</div>
						))}
					</div>
				</ScrollArea>
			</SidebarContent>
		</>
	);
}
