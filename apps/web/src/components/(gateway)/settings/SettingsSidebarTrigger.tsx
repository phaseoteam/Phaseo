"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";

import { getActiveSettingsNav, getSettingsSidebar } from "./Sidebar.config";

export default function SettingsSidebarTrigger({
	className,
	showBroadcast = true,
	triggerLabel,
}: {
	className?: string;
	showBroadcast?: boolean;
	triggerLabel?: string;
}) {
	const pathname = usePathname();
	const [open, setOpen] = React.useState(false);
	const navGroups = React.useMemo(
		() => getSettingsSidebar({ showBroadcast }),
		[showBroadcast],
	);
	const activeNav = React.useMemo(
		() => getActiveSettingsNav(pathname ?? "", { showBroadcast }),
		[pathname, showBroadcast],
	);
	const activeItem = activeNav?.item ?? null;
	const label = triggerLabel ?? activeItem?.label ?? "Settings";

	return (
		<div className="lg:hidden">
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger asChild>
					<Button
						variant="outline"
						className={cn("w-full justify-between", className)}
						aria-label="Open settings sections"
					>
						<span className="flex min-w-0 items-center gap-2">
							{triggerLabel ? <PanelLeftIcon className="h-4 w-4 shrink-0" /> : null}
							<span className="truncate">{label}</span>
							{!triggerLabel && activeItem?.badge ? (
								<Badge
									variant="outline"
									className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
								>
									{activeItem.badge}
								</Badge>
							) : null}
						</span>
						{triggerLabel ? null : (
							<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
						)}
					</Button>
				</SheetTrigger>
				<SheetContent side="left" className="w-[20rem] max-w-[90vw] gap-0 p-0">
					<SheetHeader className="border-b px-4 py-4">
						<SheetTitle className="text-sm">Settings</SheetTitle>
					</SheetHeader>
					<div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
						{navGroups.map((group) => (
							<div key={group.heading ?? "settings"} className="pb-3">
								{group.heading ? (
									<div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
										{group.heading}
									</div>
								) : null}
								<div className="space-y-1">
									{group.items.map((item) => {
										const active = activeItem?.href === item.href;
										const Icon = item.icon;

										return (
											<Link
												key={item.href}
												href={item.href}
												prefetch={false}
												aria-current={active ? "page" : undefined}
												onClick={() => setOpen(false)}
												className={cn(
													"flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
													active
														? "bg-muted font-medium text-foreground"
														: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
												)}
											>
												{Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
												<span className="min-w-0 flex-1 truncate">{item.label}</span>
												{item.badge ? (
													<Badge
														variant="outline"
														className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
													>
														{item.badge}
													</Badge>
												) : null}
											</Link>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
