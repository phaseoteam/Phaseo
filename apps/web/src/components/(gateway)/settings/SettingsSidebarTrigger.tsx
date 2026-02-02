"use client";

import { usePathname } from "next/navigation";
import { PanelLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

import type { NavItem } from "./Sidebar.config";
import { SETTINGS_SIDEBAR } from "./Sidebar.config";

export default function SettingsSidebarTrigger() {
	const pathname = usePathname();
	const { toggleSidebar } = useSidebar();

	const allItems: NavItem[] = SETTINGS_SIDEBAR.flatMap((g) => g.items);
	const activeItem =
		allItems
			.filter((item) => !item.disabled && !item.external)
			.sort((a, b) => b.href.length - a.href.length)
			.find(
				(item) =>
					pathname === item.href ||
					pathname?.startsWith(item.href + "/")
			) ?? null;

	return (
		<div className="md:hidden">
			<Button
				variant="outline"
				className="w-full justify-between"
				onClick={toggleSidebar}
				aria-haspopup="dialog"
			>
				<span className="flex items-center gap-2">
					<span>{activeItem?.label ?? "Settings"}</span>
					{activeItem?.badge && (
						<Badge
							variant="outline"
							className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
						>
							{activeItem.badge}
						</Badge>
					)}
				</span>
				<PanelLeftIcon className="h-4 w-4" aria-hidden="true" />
			</Button>
		</div>
	);
}
