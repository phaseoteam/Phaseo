// components/header/TeamSwitcher.tsx (CLIENT)
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
	LogOut,
	CreditCard,
	Key as KeyIcon,
	Activity,
	ScrollText,
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
	MessageSquareMore,
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
import { ProductFeedbackDialog } from "@/components/feedback/ProductFeedbackButton";

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
	const tNav = useTranslations("Common.nav");
	const tUi = useTranslations("Common.ui");
	const router = useRouter();
	const pathname = usePathname();
	const { theme, setTheme } = useTheme();

	const getInitialTeamId = (initial?: string) => {
		if (initial) return initial;
		return teams.length ? teams[0].id : undefined;
	};

	const [activeWorkspaceId, setActiveTeamId] = useState<string | undefined>(() =>
		getInitialTeamId(initialActiveTeamId)
	);
	const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
	const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId) ?? teams[0];
	const currentTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";
	const themeMeta = {
		light: { icon: Sun },
		dark: { icon: Moon },
		system: { icon: Monitor },
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
						aria-label={tNav("openWorkspaceSwitcher")}
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
							{activeTeam ? activeTeam.name : tNav("personalWorkspace")}
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
					className="w-56 rounded-lg"
				>
					<div>
						{teams.slice(0, 10).map((t) => {
							const isActive = t.id === activeWorkspaceId;
							return (
								<DropdownMenuItem
									key={t.id}
									className={cn(
										"cursor-pointer rounded-lg",
										isActive && "bg-accent text-accent-foreground"
									)}
									closeOnClick={!isActive}
									onClick={() => {
										if (isActive) {
											if (
												typeof navigator === "undefined" ||
												!navigator?.clipboard?.writeText
											) {
												toast.error(tUi("workspaceSwitcher.clipboardUnavailable"), {
													position: "bottom-right",
												});
												return;
											}
											void navigator.clipboard
												.writeText(t.id)
												.then(() => {
													toast.success(tUi("workspaceSwitcher.workspaceCopied"), {
														position: "bottom-right",
													});
												})
												.catch(() => {
													toast.error(tUi("workspaceSwitcher.workspaceCopyFailed"), {
														position: "bottom-right",
													});
												});
											return;
										}
										const previous = activeWorkspaceId;
										setActiveTeamId(t.id);
										toast.promise(SwapTeam(t.id), {
											loading: tUi("workspaceSwitcher.switching"),
											success: (res) => {
												if (res?.ok) {
													router.refresh();
													return tUi("workspaceSwitcher.switched", { workspace: t.name });
												} else {
													setActiveTeamId(
														previous
													);
													throw new Error(
														tUi("workspaceSwitcher.switchFailed", { workspace: t.name })
													);
												}
											},
											error: () => {
												setActiveTeamId(previous);
												return tUi("workspaceSwitcher.switchFailed", { workspace: t.name });
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
							className="cursor-pointer rounded-lg"
						>
							<Link
								href="/settings/workspaces/settings"
								className="flex w-full items-center"
							>
								<Users className="mr-2 h-4 w-4" />
								<span>{tNav("manageWorkspaces")}</span>
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
						aria-label={tNav("openProfile")}
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
					className="w-56 rounded-lg"
				>
					{/* Editor access for editors and admins */}
					{(userRole === "editor" || userRole === "admin") && (
						<>
							<DropdownMenuItem
								asChild
								className="cursor-pointer rounded-lg"
							>
								<Link
									href="/internal"
								>
									<Lock className="h-4 w-4" />
									<span>{tNav("internal")}</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}

					<div className="px-1 py-1.5">
						<div className="flex items-center gap-2">
							<span className="min-w-12 px-1 text-sm text-foreground">
								{tUi("theme.label")}
							</span>
							<div
								role="radiogroup"
							aria-label={tUi("theme.mode")}
								className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted/60 p-0.5"
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
											aria-label={tUi("theme.setMode", { theme: tUi(`theme.${mode}`) })}
											onClick={() => setTheme(mode)}
											className={cn(
												"relative flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors",
												"hover:bg-background hover:text-foreground",
												selected
													? "bg-background text-foreground shadow-xs"
													: "bg-transparent"
											)}
											title={tUi(`theme.${mode}`)}
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
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/experiments"
						>
							<FlaskConical className="h-4 w-4" />
							<span>{tNav("experiments")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/settings/workspaces/settings"
						>
							<Users className="h-4 w-4" />
							<span>{tNav("workspaces")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/settings/account"
						>
							<Settings className="h-4 w-4" />
							<span>{tNav("settings")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link
							href={`/settings/usage/overview?workspace_id=${encodeURIComponent(
								activeWorkspaceId ?? "",
							)}`}
						>
							<Activity className="h-4 w-4" />
							<span>{tNav("activity")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link
							href={`/settings/usage/logs/requests?workspace_id=${encodeURIComponent(
								activeWorkspaceId ?? "",
							)}`}
						>
							<ScrollText className="h-4 w-4" />
							<span>{tNav("logs")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/settings/credits"
						>
							<CreditCard className="h-4 w-4" />
							<span>{tNav("credits")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/settings/keys"
						>
							<KeyIcon className="h-4 w-4" />
							<span>{tNav("keys")}</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link href="/contact" className="flex w-full items-center justify-between">
							<div className="flex items-center gap-2">
								<LifeBuoy className="h-4 w-4" />
								<span>{tNav("support")}</span>
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
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer rounded-lg"
						onClick={() => {
							setIsProfileMenuOpen(false);
							setIsFeedbackOpen(true);
						}}
					>
						<MessageSquareMore className="h-4 w-4" />
						<span>{tNav("sendFeedback")}</span>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						variant="destructive"
						className="cursor-pointer rounded-lg"
						onClick={() => {
							setIsProfileMenuOpen(false);
							onSignOut?.();
						}}
					>
						<LogOut className="h-4 w-4" />
						{tNav("signOut")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ProductFeedbackDialog
				open={isFeedbackOpen}
				onOpenChange={setIsFeedbackOpen}
				surface="profile_menu"
				prompt={tUi("feedbackPrompt")}
			/>
		</div>
	);
}
