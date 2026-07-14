"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { getActiveSettingsNav, getSettingsSidebar } from "./Sidebar.config";

export default function SettingsSidebarTrigger({
	showBroadcast = true,
	showWebhooks = true,
}: {
	showBroadcast?: boolean;
	showWebhooks?: boolean;
}) {
	const pathname = usePathname();
	const navGroups = getSettingsSidebar({ showBroadcast, showWebhooks });
	const activeNav = getActiveSettingsNav(pathname ?? "", { showBroadcast, showWebhooks });
	const activeItem = activeNav?.item ?? null;

	return (
		<div className="lg:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						className="w-full justify-between"
						aria-haspopup="menu"
					>
						<span className="flex items-center gap-2 min-w-0">
							<span className="truncate">{activeItem?.label ?? "Settings"}</span>
							{activeItem?.badge && (
								<Badge
									variant="outline"
									className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
								>
									{activeItem.badge}
								</Badge>
							)}
						</span>
						<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-[min(24rem,calc(100vw-2rem))]"
				>
					{navGroups.map((group, index) => (
						<div key={`${group.heading ?? "group"}-${index}`}>
							{group.heading ? (
								<DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
									{group.heading}
								</DropdownMenuLabel>
							) : null}
							{group.items.map((item) => {
								const active = activeItem?.href === item.href;
								return (
									<DropdownMenuItem key={item.href} asChild>
										<Link href={item.href} className="flex w-full items-center gap-2">
											<span className="min-w-0 flex-1 truncate">
												{item.label}
											</span>
											{item.badge ? (
												<Badge
													variant="outline"
													className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
												>
													{item.badge}
												</Badge>
											) : null}
											{active ? <Check className="h-4 w-4 shrink-0" /> : null}
										</Link>
									</DropdownMenuItem>
								);
							})}
							{index < navGroups.length - 1 ? <DropdownMenuSeparator /> : null}
						</div>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
