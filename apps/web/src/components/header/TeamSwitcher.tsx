// components/header/TeamSwitcher.tsx (CLIENT)
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

	const [activeTeamId, setActiveTeamId] = useState<string | undefined>(() =>
		getInitialTeamId(initialActiveTeamId)
	);
	const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);

	const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0];
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
		const { date, day, minutes } = getLondonInfo();
		console.log(
			"[team-switcher] London",
			date.toISOString(),
			`day=${day}`,
			`minuteOfDay=${minutes}`,
			`open=${supportIsOpen}`,
			`wait=${minutesUntilNextWindow ?? "n/a"}`
		);
	}, [supportIsOpen, minutesUntilNextWindow]);

	return (
		<div className="flex items-center gap-2">
			{/* Team Dropdown */}
			<DropdownMenu open={isTeamMenuOpen} onOpenChange={setIsTeamMenuOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						aria-label="Open team switcher"
						className={cn(
							"inline-flex items-center gap-2 rounded-lg px-3 h-10 leading-none cursor-pointer",
							"border border-transparent text-sm font-medium text-foreground",
							"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50"
						)}
					>
						<span
							className="max-w-32 truncate text-sm font-medium select-none"
							title={activeTeam ? activeTeam.name : undefined}
						>
							{activeTeam ? activeTeam.name : "Personal Team"}
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
					className={cn(
						"w-56 rounded-xl p-1",
						"border border-zinc-200/70 dark:border-zinc-800"
					)}
				>
					<div>
						{teams.slice(0, 5).map((t) => {
							const isActive = t.id === activeTeamId;
							return (
								<DropdownMenuItem
									key={t.id}
									className={cn(
										"rounded-md text-sm cursor-pointer",
										"focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground",
										"py-1.5"
									)}
									onSelect={(e) => {
										e.preventDefault();
										if (isActive) return;
										const previous = activeTeamId;
										setActiveTeamId(t.id);
										toast.promise(SwapTeam(t.id), {
											loading: "Swapping team...",
											success: (res) => {
												if (res?.ok) {
													router.refresh();
													return `Successfully swapped to ${t.name} team`;
												} else {
													setActiveTeamId(
														previous
													);
													throw new Error(
														"Failed to swap team"
													);
												}
											},
											error: () => {
												setActiveTeamId(previous);
												return `Failed to swap to ${t.name} team, please try again`;
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
							<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />
						) : null}
						<DropdownMenuItem
							asChild
							className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
						>
							<Link
								href="/settings/teams"
								className="flex w-full items-center"
								onClick={(e) => {
									e.preventDefault();
									navigateWithViewTransition("/settings/teams");
								}}
							>
								<Users className="mr-2 h-4 w-4" />
								<span>Manage Teams</span>
							</Link>
						</DropdownMenuItem>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Profile Dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						aria-label="Open profile menu"
						className={cn(
							"inline-flex items-center justify-center rounded-lg cursor-pointer",
							"text-foreground",
							"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50"
						)}
					>
						<CurrentUserAvatar user={user} />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					align="end"
					className={cn(
						"w-56 rounded-xl p-1",
						"border border-zinc-200/70 dark:border-zinc-800"
					)}
				>
					{/* Editor access for editors and admins */}
					{(userRole === "editor" || userRole === "admin") && (
						<>
							<DropdownMenuItem
								className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
								onSelect={(e) => {
									e.preventDefault();
									router.push("/internal");
								}}
							>
								<Lock className="h-4 w-4" />
								<span>Internal</span>
							</DropdownMenuItem>
							<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />
						</>
					)}

					<div className="px-1 py-1">
						<div
							role="radiogroup"
							aria-label="Theme mode"
							className="inline-flex w-full items-center justify-center gap-1 rounded-md p-0.5"
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
											"relative flex h-7 flex-1 items-center justify-center rounded-md text-zinc-500 transition-colors",
											"hover:bg-zinc-100/70 hover:text-zinc-900 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
											selected
												? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
												: "bg-transparent dark:text-zinc-300"
										)}
										title={themeMeta[mode].label}
									>
										<Icon className="h-4 w-4" />
									</button>
								);
							})}
						</div>
					</div>

					<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />

					<DropdownMenuItem
						asChild
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					>
						<Link
							href="/settings/account"
							onClick={(e) => {
								e.preventDefault();
								navigateWithViewTransition("/settings/account");
							}}
						>
							<Settings className="h-4 w-4" />
							<span>Settings</span>
						</Link>
					</DropdownMenuItem>

					<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />

					<DropdownMenuItem
						asChild
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					>
						<Link
							href={`/settings/usage?team_id=${encodeURIComponent(
								activeTeamId ?? "",
							)}`}
							onClick={(e) => {
								e.preventDefault();
								navigateWithViewTransition(
									`/settings/usage?team_id=${encodeURIComponent(
										activeTeamId ?? "",
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
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					>
						<Link
							href="/settings/credits"
							onClick={(e) => {
								e.preventDefault();
								navigateWithViewTransition("/settings/credits");
							}}
						>
							<CreditCard className="h-4 w-4" />
							<span>Credits</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					>
						<Link
							href="/settings/keys"
							onClick={(e) => {
								e.preventDefault();
								navigateWithViewTransition("/settings/keys");
							}}
						>
							<KeyIcon className="h-4 w-4" />
							<span>Keys</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
						onSelect={(e) => {
							e.preventDefault();
							router.push("/contact");
						}}
					>
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-2">
								<LifeBuoy className="h-4 w-4 text-primary" />
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

					<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />

					<DropdownMenuItem
						className="rounded-md py-1.5 text-sm cursor-pointer focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
						onSelect={(e) => {
							e.preventDefault();
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

