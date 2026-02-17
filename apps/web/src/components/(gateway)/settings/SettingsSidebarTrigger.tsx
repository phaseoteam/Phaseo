"use client";

import { usePathname } from "next/navigation";
import { PanelLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

import type { NavItem } from "./Sidebar.config";
import { getSettingsSidebar } from "./Sidebar.config";

export default function SettingsSidebarTrigger({
	showBroadcast = true,
}: {
	showBroadcast?: boolean;
}) {
	const pathname = usePathname();
	const { toggleSidebar } = useSidebar();
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
				if (a.score!.exact !== b.score!.exact)
					return a.score!.exact ? -1 : 1;
				return b.score!.len - a.score!.len;
			})[0]?.item ?? null;

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
