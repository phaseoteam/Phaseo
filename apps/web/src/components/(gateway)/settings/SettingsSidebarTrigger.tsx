"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
	Building2,
	ChevronRight,
	ExternalLink,
	Menu as MenuIcon,
	UserRound,
	X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";

import {
	getActiveSettingsNav,
	getSettingsSidebar,
	isSettingsNavChildActive,
	type NavItem,
	type SettingsScope,
} from "./Sidebar.config";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function SettingsSidebarTrigger({
	showBroadcast = true,
	showWebhooks = true,
}: {
	showBroadcast?: boolean;
	showWebhooks?: boolean;
}) {
	const pathname = usePathname() ?? "";
	const searchParams = useSearchParams();
	const [open, setOpen] = useState(false);
	const isHydrated = useSyncExternalStore(
		subscribe,
		getClientSnapshot,
		getServerSnapshot,
	);
	const navGroups = getSettingsSidebar({ showBroadcast, showWebhooks });
	const activeNav = getActiveSettingsNav(pathname, {
		showBroadcast,
		showWebhooks,
	});
	const activeItem = activeNav?.item ?? null;
	const activeScope = activeNav?.group.scope ?? "personal";
	const [scopeSelection, setScopeSelection] = useState<{
		routeScope: SettingsScope;
		selectedScope: SettingsScope;
	} | null>(null);
	const visibleScope =
		scopeSelection?.routeScope === activeScope
			? scopeSelection.selectedScope
			: activeScope;
	const visibleGroups = navGroups.filter(
		(group) => group.scope === visibleScope,
	);

	if (!isHydrated || !pathname.startsWith("/settings")) return null;

	const close = () => setOpen(false);
	const selectScope = (selectedScope: SettingsScope) => {
		setScopeSelection({ routeScope: activeScope, selectedScope });
	};

	const renderItem = (item: NavItem, heading: string) => {
		const active = !item.disabled && !item.external && activeItem?.href === item.href;
		const Icon = item.icon;
		const itemContent = (
			<>
				{Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				{item.badge ? (
					<Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
						{item.badge}
					</Badge>
				) : null}
				{item.external ? <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
			</>
		);
		const itemClassName = cn(
			"flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
			active
				? "bg-accent text-accent-foreground"
				: "text-foreground hover:bg-accent/70",
			item.disabled && "pointer-events-none opacity-50",
		);

		if (item.children?.length) {
			return (
				<Collapsible
					key={`${heading}-${item.href}-${active}`}
					defaultOpen={active}
					className="group/collapsible"
				>
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className={cn(
								itemClassName,
								active && "bg-transparent hover:bg-accent/70",
							)}
						>
							{itemContent}
							<ChevronRight
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open/collapsible:rotate-90"
							/>
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="ml-5 space-y-1 border-l border-border px-2.5 py-1">
							{item.children.map((child) => {
								const childActive = isSettingsNavChildActive(
									pathname,
									searchParams.get("view"),
									child,
								);
								return (
									<Link
										key={child.href}
										href={child.href}
										onClick={close}
										aria-current={childActive ? "page" : undefined}
										className={cn(
											"flex h-8 items-center rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
											childActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
										)}
									>
										<span className="truncate">{child.label}</span>
									</Link>
								);
							})}
						</div>
					</CollapsibleContent>
				</Collapsible>
			);
		}

		if (item.external) {
			return (
				<a
					key={`${heading}-${item.href}`}
					href={item.href}
					target="_blank"
					rel="noreferrer"
					className={itemClassName}
					onClick={close}
				>
					{itemContent}
				</a>
			);
		}

		return (
			<Link
				key={`${heading}-${item.href}`}
				href={item.href}
				className={itemClassName}
				aria-current={active ? "page" : undefined}
				onClick={close}
			>
				{itemContent}
			</Link>
		);
	};

	return (
		<div className="flex items-center lg:hidden">
			<Sheet
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (nextOpen) setScopeSelection(null);
				}}
			>
				<SheetTrigger asChild>
					<button
						type="button"
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"size-[var(--site-header-control-h,2.25rem)] shrink-0 rounded-lg",
						)}
						aria-label="Open settings menu"
					>
						<MenuIcon className="size-5" aria-hidden="true" />
					</button>
				</SheetTrigger>
				<SheetContent
					side="left"
					showCloseButton={false}
					className="w-[min(20rem,calc(100vw-1rem))] p-0"
				>
					<SheetHeader className="flex h-[var(--site-header-height,3.75rem)] flex-row items-center justify-between gap-3 border-b px-4 py-0">
						<div className="min-w-0">
							<SheetTitle>Settings</SheetTitle>
							<SheetDescription className="sr-only">
								Navigate account and workspace settings.
							</SheetDescription>
						</div>
						<SheetClose asChild>
							<Button variant="ghost" size="icon" aria-label="Close settings menu">
								<X className="size-5" />
							</Button>
						</SheetClose>
					</SheetHeader>
					<div className="px-3 pt-3">
						<div className="grid grid-cols-2 rounded-lg bg-muted/70 p-1" aria-label="Settings scope">
							<button
								type="button"
								aria-pressed={visibleScope === "personal"}
								onClick={() => selectScope("personal")}
								className={cn(
									"flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium",
									visibleScope === "personal"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<UserRound className="size-3.5" /> Account
							</button>
							<button
								type="button"
								aria-pressed={visibleScope === "workspace"}
								onClick={() => selectScope("workspace")}
								className={cn(
									"flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium",
									visibleScope === "workspace"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Building2 className="size-3.5" /> Workspace
							</button>
						</div>
					</div>
					<ScrollArea className="min-h-0 flex-1">
						<div className="space-y-3 px-3 py-3">
							{visibleGroups.map((group, index) => {
								const heading = (group.heading ?? "").trim();
								return (
									<div
										key={`${heading || "group"}-${index}`}
										className={cn(index > 0 && "border-t pt-3")}
									>
										{heading ? (
											<p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
												{heading}
											</p>
										) : null}
										<div className="space-y-1">
											{group.items.map((item) => renderItem(item, heading))}
										</div>
									</div>
								);
							})}
						</div>
					</ScrollArea>
				</SheetContent>
			</Sheet>
		</div>
	);
}
