// components/header/TeamSwitcher.tsx (CLIENT)
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
	LogOut,
	CreditCard,
	Key as KeyIcon,
	BarChart2,
	Check,
	Settings,
	LifeBuoy,
	Users,
	Lock,
	FlaskConical,
	ChevronDown,
	Sun,
	Moon,
	Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SwapTeam } from "@/app/(dashboard)/actions";
import { CurrentUserAvatar } from "../ui/current-user-avatar";
import { cn } from "@/lib/utils";
import { getLondonInfo, getSupportAvailability } from "@/lib/support/schedule";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface TeamSwitcherProps {
	user?: any;
	teams?: { id: string; name: string }[];
	onSignOut?: () => void;
	initialActiveTeamId?: string;
	userRole?: string | undefined;
}

export default function TeamSwitcher({
	user,
	teams = [],
	onSignOut,
	initialActiveTeamId,
	userRole,
}: TeamSwitcherProps) {
	const router = useRouter();
	const pathname = usePathname();
	const { theme, setTheme } = useTheme();

	const navigateWithViewTransition = React.useCallback(
		(href: string) => {
			const doc = document as Document & {
				startViewTransition?: (
					updateCallback: () => void | Promise<void>,
				) => unknown;
			};
			if (typeof doc.startViewTransition === "function") {
				doc.startViewTransition(() => {
					router.push(href);
				});
				return;
			}
			router.push(href);
		},
		[router],
	);

	const getInitialTeamId = (initial?: string) => {
		if (initial) return initial;
		return teams.length ? teams[0].id : undefined;
	};

	const [activeWorkspaceId, setActiveTeamId] = useState<string | undefined>(() =>
		getInitialTeamId(initialActiveTeamId)
	);
	const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
	const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId) ?? teams[0];
	const currentTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";
	const themeMeta = {
		light: { label: "Light", icon: Sun },
		dark: { label: "Dark", icon: Moon },
		system: { label: "System", icon: Monitor },
	} as const;
	const { isOpen: supportIsOpen, minutesUntilNextWindow } =
		getSupportAvailability();
	const supportDotClasses = supportIsOpen
		? "bg-emerald-500 ring-emerald-400/60"
		: "bg-amber-500 ring-amber-400/60";

	useEffect(() => {
		const { isoLike, day, minutes } = getLondonInfo();
		console.log(
			"[workspace-switcher] London",
			isoLike,
			`day=${day}`,
			`minuteOfDay=${minutes}`,
			`open=${supportIsOpen}`,
			`wait=${minutesUntilNextWindow ?? "n/a"}`
		);
	}, [supportIsOpen, minutesUntilNextWindow]);

	useEffect(() => {
		setIsTeamMenuOpen(false);
		setIsProfileMenuOpen(false);
	}, [pathname]);

	return (
		<div className="flex items-center gap-2">
			{/* Workspace Dropdown */}
			<DropdownMenu open={isTeamMenuOpen} onOpenChange={setIsTeamMenuOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						aria-label="Open workspace switcher"
						className={cn(
							"inline-flex h-[var(--site-header-control-h,2.25rem)] items-center gap-2 rounded-lg px-3 leading-none cursor-pointer",
							"border border-transparent text-[13px] font-medium text-foreground",
							"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50"
						)}
					>
						<span
							className="max-w-32 truncate text-sm font-medium select-none"
							title={activeTeam ? activeTeam.name : undefined}
						>
							{activeTeam ? activeTeam.name : "Personal Workspace"}
						</span>
						<ChevronDown
							className={cn(
								"h-4 w-4 text-zinc-500 transition-transform",
								isTeamMenuOpen && "rotate-180"
							)}
						/>
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					align="end"
					className="w-56"
				>
					<div>
						{teams.slice(0, 5).map((t) => {
							const isActive = t.id === activeWorkspaceId;
							return (
								<DropdownMenuItem
									key={t.id}
									className={cn(
										"cursor-pointer",
										isActive && "bg-accent text-accent-foreground"
									)}
									onSelect={(e) => {
										e.preventDefault();
										if (isActive) {
											if (
												typeof navigator === "undefined" ||
												!navigator?.clipboard?.writeText
											) {
												toast.error("Clipboard is not available.", {
													position: "bottom-right",
												});
												return;
											}
											void navigator.clipboard
												.writeText(t.id)
												.then(() => {
													toast.success("Workspace UUID copied to clipboard.", {
														position: "bottom-right",
													});
												})
												.catch(() => {
													toast.error("Failed to copy workspace UUID.", {
														position: "bottom-right",
													});
												});
											return;
										}
										const previous = activeWorkspaceId;
										setActiveTeamId(t.id);
										toast.promise(SwapTeam(t.id), {
											loading: "Switching workspace...",
											success: (res) => {
												if (res?.ok) {
													router.refresh();
													return `Switched to ${t.name} workspace`;
												} else {
													setActiveTeamId(
														previous
													);
													throw new Error(
														"Failed to switch workspace"
													);
												}
											},
											error: () => {
												setActiveTeamId(previous);
												return `Failed to switch to ${t.name} workspace, please try again`;
											},
										});
									}}
								>
									<span
										className={cn(
											"truncate",
											isActive && "text-foreground"
										)}
									>
										{t.name}
									</span>
									{isActive && (
										<Check className="ml-auto h-4 w-4 text-primary" />
									)}
								</DropdownMenuItem>
							);
						})}
						{teams.length > 0 ? (
							<DropdownMenuSeparator />
						) : null}
						<DropdownMenuItem
							asChild
							className="cursor-pointer"
						>
							<Link
								href="/settings/workspaces/settings"
								className="flex w-full items-center"
								onClick={(e) => {
									e.preventDefault();
									setIsTeamMenuOpen(false);
									navigateWithViewTransition("/settings/workspaces/settings");
								}}
							>
								<Users className="mr-2 h-4 w-4" />
								<span>Manage Workspaces</span>
							</Link>
						</DropdownMenuItem>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Profile Dropdown */}
			<DropdownMenu
				open={isProfileMenuOpen}
				onOpenChange={setIsProfileMenuOpen}
			>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Open profile menu"
						className={cn(
							"size-[var(--site-header-control-h,2.25rem)] rounded-full p-0",
							"bg-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
							isProfileMenuOpen && "bg-zinc-100/70 dark:bg-zinc-900/60",
						)}
					>
						<CurrentUserAvatar user={user} />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					align="end"
					className="w-56"
				>
					{/* Editor access for editors and admins */}
					{(userRole === "editor" || userRole === "admin") && (
						<>
							<DropdownMenuItem
								asChild
								className="cursor-pointer"
							>
								<Link
									href="/internal"
									onClick={(e) => {
										e.preventDefault();
										setIsProfileMenuOpen(false);
										navigateWithViewTransition("/internal");
									}}
								>
									<Lock className="h-4 w-4" />
									<span>Internal</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}

					<div className="px-1 py-1.5">
						<div className="flex items-center gap-2">
							<span className="min-w-12 px-1 text-sm text-foreground">
								Theme
							</span>
							<div
								role="radiogroup"
								aria-label="Theme mode"
								className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-muted/60 p-0.5"
							>
								{(["light", "dark", "system"] as const).map((mode) => {
									const Icon = themeMeta[mode].icon;
									const selected = currentTheme === mode;
									return (
										<button
											key={mode}
											type="button"
											role="radio"
											aria-checked={selected}
											aria-label={`Set theme: ${themeMeta[mode].label}`}
											onClick={() => setTheme(mode)}
											className={cn(
												"relative flex h-7 flex-1 items-center justify-center rounded-lg text-muted-foreground transition-colors",
												"hover:bg-background hover:text-foreground",
												selected
													? "bg-background text-foreground shadow-xs"
													: "bg-transparent"
											)}
											title={themeMeta[mode].label}
										>
											<Icon className="h-4 w-4" />
										</button>
									);
								})}
							</div>
						</div>
					</div>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href="/experiments"
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition("/experiments");
							}}
						>
							<FlaskConical className="h-4 w-4" />
							<span>Experiments</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href="/settings/workspaces/settings"
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition("/settings/workspaces/settings");
							}}
						>
							<Users className="h-4 w-4" />
							<span>Workspaces</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href="/settings/account"
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition("/settings/account");
							}}
						>
							<Settings className="h-4 w-4" />
							<span>Settings</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href={`/settings/usage?workspace_id=${encodeURIComponent(
								activeWorkspaceId ?? "",
							)}`}
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition(
									`/settings/usage?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`,
								);
							}}
						>
							<BarChart2 className="h-4 w-4" />
							<span>Usage</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href="/settings/credits"
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition("/settings/credits");
							}}
						>
							<CreditCard className="h-4 w-4" />
							<span>Credits</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer"
					>
						<Link
							href="/settings/keys"
							onClick={(e) => {
								e.preventDefault();
								setIsProfileMenuOpen(false);
								navigateWithViewTransition("/settings/keys");
							}}
						>
							<KeyIcon className="h-4 w-4" />
							<span>Keys</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={(e) => {
							e.preventDefault();
							setIsProfileMenuOpen(false);
							navigateWithViewTransition("/contact");
						}}
					>
						<div className="flex w-full items-center justify-between">
							<div className="flex items-center gap-2">
								<LifeBuoy className="h-4 w-4" />
								<span>Support</span>
							</div>
							<span
								className="relative flex h-2.5 w-2.5"
								aria-hidden="true"
							>
								{supportIsOpen && (
									<span
										className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
											supportDotClasses
												.split(" ")
												.find((c) =>
													c.startsWith("ring-")
												)
												?.replace("ring-", "bg-")
												.replace("/60", "") || ""
										} opacity-75`}
									></span>
								)}
								<span
									className={`relative inline-flex h-full w-full rounded-full ${
										supportDotClasses
											.split(" ")
											.find((c) => c.startsWith("bg-")) ||
										""
									}`}
								></span>
							</span>
						</div>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						variant="destructive"
						className="cursor-pointer"
						onClick={(e) => {
							e.preventDefault();
							setIsProfileMenuOpen(false);
							onSignOut?.();
						}}
					>
						<LogOut className="h-4 w-4" />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

