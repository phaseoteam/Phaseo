// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Logs,
	Boxes,
	BookOpenText,
	CreditCard,
	Key as KeyIcon,
	LifeBuoy,
	Lock,
	LogOut,
	Monitor,
	Moon,
	FlaskConical,
	ChevronDown,
	Scale,
	Settings,
	Server,
	AppWindow,
	Trophy,
	MessageSquare,
	MessageSquareMore,
	Sun,
	Sparkles,
	Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import TeamSwitcher from "./TeamSwitcher";
import { SwapTeam } from "@/app/(dashboard)/actions";
import { postClientAuthSignOut } from "@/lib/fetchers/internal/postClientAuthSignOut";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CurrentUserAvatar } from "@/components/ui/current-user-avatar";
import { getSupportAvailability } from "@/lib/support/schedule";
import { ProductFeedbackDialog } from "@/components/feedback/ProductFeedbackButton";
import { isPublicDataPathname } from "@/lib/publicDataRoutes";
import { clearAccountQueryCache, clearAccountQueryScope } from "@/lib/query/invalidation";
import { toAccountQueryScope } from "@/lib/query/queryKeys";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import type { DisplayPreferences } from "@/lib/displayPreferences";
import type { InternalAuthHeaderUser } from "@/lib/fetchers/internal/authTypes";
import { WorkspaceCombobox } from "./WorkspaceCombobox";
import { PhaseoActionDock } from "@/components/action-dock/PhaseoActionDock";
import { setActionDockEnabled, useActionDockEnabled } from "@/lib/actionDockPreferences";

interface HeaderProps {
	isLoggedIn: boolean;
	user?: InternalAuthHeaderUser;
	teams?: { id: string; name: string }[];
	displayPreferences?: DisplayPreferences;
	currentTeamId?: string;
	userRole?: string | undefined;
	providerMode?: boolean;
	variant?: "mobile" | "desktop";
}

export default function HeaderClient({
	isLoggedIn,
	user,
	teams = [],
	displayPreferences,
	currentTeamId,
	userRole,
	providerMode = false,
	variant = "desktop",
}: HeaderProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const pathname = usePathname() ?? "/";
	const isPublicDataPage = isPublicDataPathname(pathname);
	const { theme, setTheme } = useTheme();
	const { isHydrated: displayPreferencesHydrated, setPreferences } = useDisplayPreferences();
	const currentTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";
	const themeMeta = {
		light: { label: "Light", icon: Sun },
		dark: { label: "Dark", icon: Moon },
		system: { label: "System", icon: Monitor },
	} as const;
	const { isOpen: supportIsOpen } = getSupportAvailability();
	const supportDotClasses = supportIsOpen
		? "bg-emerald-500 ring-emerald-400/60"
		: "bg-amber-500 ring-amber-400/60";
	const supportDotClass =
		supportDotClasses
			.split(" ")
			.find((value) => value.startsWith("bg-")) ?? "bg-muted-foreground";
	const [activeWorkspaceId, setActiveTeamId] = useState<string | undefined>(
		currentTeamId ?? teams[0]?.id,
	);
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
	const canUseActionDock = providerMode || userRole?.toLocaleLowerCase() === "admin";
	const actionDockEnabled = useActionDockEnabled(user?.id);

	useEffect(() => {
		setActiveTeamId(currentTeamId ?? teams[0]?.id);
	}, [currentTeamId, teams]);

	useEffect(() => {
		if (displayPreferencesHydrated && isLoggedIn && displayPreferences) {
			setPreferences(displayPreferences);
		}
	}, [displayPreferences, displayPreferencesHydrated, isLoggedIn, setPreferences]);

	async function handleSignOut() {
		try {
			await postClientAuthSignOut();
		} catch (error) {
			console.error("Sign out error", error);
		} finally {
			clearAccountQueryCache(queryClient);
			window.location.assign("/");
		}
	}

	async function handleTeamSwitch(nextTeamId: string, teamName: string) {
		if (nextTeamId === activeWorkspaceId) return true;

		const previousTeamId = activeWorkspaceId;
		setActiveTeamId(nextTeamId);

		const result = await SwapTeam(nextTeamId);
		if (!result?.ok) {
			setActiveTeamId(previousTeamId);
			toast.error(`Failed to switch to ${teamName} workspace`, {
				position: "bottom-right",
			});
			return false;
		}

		clearAccountQueryScope(
			queryClient,
			toAccountQueryScope({ userId: user?.id, workspaceId: previousTeamId }),
		);
		router.refresh();
		toast.success(`Switched to ${teamName} workspace`, {
			position: "bottom-right",
		});
		return true;
	}

	const navLinks = [
		{ href: "/models", label: "Models", icon: Boxes },
		{ href: "/chat", label: "Chat", icon: MessageSquare },
		{ href: "/compare", label: "Compare", icon: Scale },
		{ href: "/api-providers", label: "Providers", icon: Server },
		{ href: "/apps", label: "Apps", icon: AppWindow },
		{ href: "/rankings", label: "Rankings", icon: Trophy },
	];
	const docsHref = "https://phaseo.app/docs/v1";

	if (variant === "mobile") {
		if (!isLoggedIn) {
			return (
				<DropdownMenu
					open={isMobileNavOpen}
					onOpenChange={(open) => setIsMobileNavOpen(Boolean(open))}
				>
					<ButtonGroup
						className="h-8 items-stretch overflow-hidden rounded-l-lg rounded-r-md shadow-xs [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-md!"
					>
						<Button asChild className="h-8 rounded-r-none px-4">
							<Link href="/sign-up">
								Sign Up
							</Link>
						</Button>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 rounded-l-none border-l border-primary-foreground/25 px-0"
								aria-label="Open navigation menu"
							>
								<ChevronDown
									className={cn(
										"size-4 transition-transform duration-150",
										isMobileNavOpen && "rotate-180"
									)}
									aria-hidden="true"
								/>
							</Button>
						</DropdownMenuTrigger>
					</ButtonGroup>
					<DropdownMenuContent align="end" className="w-48 rounded-lg p-1">
						{navLinks.map(({ href, label, icon: Icon }) => {
							const isActive =
								pathname === href || pathname.startsWith(href + "/");
							return (
								<DropdownMenuItem
									key={href}
									asChild
									className={cn(
										"rounded-lg py-2 text-sm",
										isActive && "font-semibold text-primary"
									)}
								>
									<Link href={href} className="flex items-center gap-2">
										<Icon className="h-4 w-4" />
										{label}
									</Link>
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuItem asChild className="rounded-lg py-2 text-sm">
							<Link
								href={docsHref}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-2"
							>
								<BookOpenText className="h-4 w-4" />
								Docs
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<div className="px-1 py-1">
							<div
								role="radiogroup"
								aria-label="Theme mode"
								className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-900"
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
												"relative flex h-8 flex-1 items-center justify-center rounded-md text-zinc-500 transition-colors",
												"hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
												selected
													? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50"
													: "bg-transparent dark:text-zinc-400"
											)}
											title={themeMeta[mode].label}
										>
											<Icon className="h-4 w-4" />
										</button>
									);
								})}
							</div>
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		return (
			<>
			<div className="flex items-center gap-1">
				{!providerMode && teams.length > 0 ? (
					<WorkspaceCombobox
						workspaces={teams}
						activeWorkspaceId={activeWorkspaceId}
						triggerVariant="icon"
						onSelect={(workspace) => handleTeamSwitch(workspace.id, workspace.name)}
					/>
				) : null}
			<DropdownMenu
				open={isMobileNavOpen}
				onOpenChange={(open) => setIsMobileNavOpen(Boolean(open))}
			>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={cn(
							"size-[var(--site-header-control-h,2.25rem)] rounded-full p-0",
							"bg-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
							isMobileNavOpen && "bg-zinc-100/70 dark:bg-zinc-900/60",
						)}
						aria-label="Open profile menu"
						aria-expanded={isMobileNavOpen}
					>
						<CurrentUserAvatar user={user} />
					</Button>
				</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56 rounded-lg">
						{(userRole === "editor" || userRole === "admin") && (
							<>
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href="/internal" prefetch={false}>
										<Lock className="h-4 w-4" />
										<span>Internal</span>
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
					{navLinks.map(({ href, label, icon: Icon }) => {
						const isActive =
							pathname === href || pathname.startsWith(href + "/");
						return (
							<DropdownMenuItem
								key={href}
								asChild
								className={cn(
									"cursor-pointer rounded-lg text-sm",
									isActive && "bg-accent font-medium text-accent-foreground",
								)}
							>
								<Link href={href} prefetch={false} className="flex items-center gap-2">
									<Icon className="h-4 w-4" />
									<span>{label}</span>
								</Link>
							</DropdownMenuItem>
						);
					})}

					<DropdownMenuSeparator />

					{isLoggedIn ? (
						<>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/experiments" prefetch={false}>
									<FlaskConical className="h-4 w-4" />
									<span>Experiments</span>
								</Link>
							</DropdownMenuItem>

							{providerMode ? (
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href="/settings/provider/models" prefetch={false}>
										<Users className="h-4 w-4" />
										<span>Manage catalog</span>
									</Link>
								</DropdownMenuItem>
							) : null}

							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/account" prefetch={false}>
									<Settings className="h-4 w-4" />
									<span>Settings</span>
								</Link>
							</DropdownMenuItem>
							{user?.id && canUseActionDock && !actionDockEnabled ? (
								<DropdownMenuItem
									className="cursor-pointer rounded-lg text-sm"
										onClick={() => {
										setActionDockEnabled(user.id, true);
										setIsMobileNavOpen(false);
									}}
								>
									<Sparkles className="h-4 w-4" />
									<span>Turn on Phaseo action dock</span>
								</DropdownMenuItem>
							) : null}

							<DropdownMenuSeparator />

							{!providerMode && <>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link
									href={`/settings/usage/overview?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false}
								>
									<Activity className="h-4 w-4" />
									<span>Activity</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link
									href={`/settings/usage/logs/requests?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false}
								>
									<Logs className="h-4 w-4" />
									<span>Logs</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/credits" prefetch={false}>
									<CreditCard className="h-4 w-4" />
									<span>Credits</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/keys" prefetch={false}>
									<KeyIcon className="h-4 w-4" />
									<span>Keys</span>
								</Link>
							</DropdownMenuItem>
							</>}
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href="/contact" prefetch={false}>
										<LifeBuoy className="h-4 w-4" />
										<span className="flex min-w-0 flex-1 items-center justify-between gap-3">
											<span>Support</span>
											<span
												className="relative flex h-2.5 w-2.5 shrink-0"
												aria-hidden="true"
											>
												<span
													className={cn(
														"absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
														supportDotClass,
													)}
												/>
												<span
													className={cn(
														"relative inline-flex h-full w-full rounded-full",
														supportDotClass,
													)}
												/>
											</span>
										</span>
									</Link>
								</DropdownMenuItem>
								{!isPublicDataPage ? (
									<DropdownMenuItem
										className="cursor-pointer rounded-lg text-sm"
										onClick={() => {
											setIsMobileNavOpen(false);
											setIsFeedbackOpen(true);
										}}
									>
										<MessageSquareMore className="h-4 w-4" />
										<span>Send Feedback</span>
									</DropdownMenuItem>
								) : null}
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href={docsHref} target="_blank" rel="noreferrer">
										<BookOpenText className="h-4 w-4" />
										<span>Docs</span>
									</Link>
								</DropdownMenuItem>

								<DropdownMenuSeparator />

								<div className="px-1 py-1">
									<div
										role="radiogroup"
										aria-label="Theme mode"
										className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-muted/60 p-0.5"
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
														"relative flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors",
														"hover:bg-background hover:text-foreground",
														selected
															? "bg-background text-foreground shadow-xs"
															: "bg-transparent",
													)}
													title={themeMeta[mode].label}
												>
													<Icon className="h-4 w-4" />
												</button>
											);
										})}
									</div>
								</div>

								<DropdownMenuSeparator />

								<DropdownMenuItem
									variant="destructive"
									className="cursor-pointer rounded-lg text-sm"
								onClick={() => {
									void handleSignOut();
								}}
							>
								<LogOut className="h-4 w-4" />
								<span>Sign out</span>
							</DropdownMenuItem>
						</>
					) : (
						<>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/sign-up">
									Sign Up
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<div className="px-1 py-1">
								<div
									role="radiogroup"
									aria-label="Theme mode"
									className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-muted/60 p-0.5"
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
													"relative flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors",
													"hover:bg-background hover:text-foreground",
													selected
														? "bg-background text-foreground shadow-xs"
														: "bg-transparent",
												)}
												title={themeMeta[mode].label}
											>
												<Icon className="h-4 w-4" />
											</button>
										);
									})}
								</div>
							</div>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			</div>
			<ProductFeedbackDialog
				open={isFeedbackOpen}
				onOpenChange={setIsFeedbackOpen}
				surface="profile_menu_mobile"
				prompt="Tell us what should be clearer, faster, or more useful across Phaseo."
			/>
			</>
		);
	}

	return (
		<div className="flex items-center gap-4">
			{isLoggedIn ? (
				<>
					<TeamSwitcher
						user={user}
						teams={teams}
						userRole={userRole}
						providerMode={providerMode}
						onSignOut={handleSignOut}
						initialActiveTeamId={currentTeamId}
					/>
					{user?.id ? (
						<PhaseoActionDock
							key={user.id}
							userId={user.id}
							userRole={userRole}
							providerMode={providerMode}
						/>
					) : null}
				</>
			) : (
				<Link href="/sign-up">
					<Button
						variant="default"
						className="rounded-lg px-4 py-2 text-xs font-semibold"
					>
						Sign Up
					</Button>
				</Link>
			)}
		</div>
	);
}
