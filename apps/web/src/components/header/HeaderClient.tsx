// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	Activity,
	ScrollText,
	Boxes,
	BookOpenText,
	Check,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CurrentUserAvatar } from "@/components/ui/current-user-avatar";
import { getSupportAvailability } from "@/lib/support/schedule";
import { ProductFeedbackDialog } from "@/components/feedback/ProductFeedbackButton";
import { getLocalizedDocsHref } from "@/lib/docs";

interface HeaderProps {
	isLoggedIn: boolean;
	user?: any;
	teams?: { id: string; name: string }[];
	currentTeamId?: string;
	userRole?: string | undefined;
	variant?: "mobile" | "desktop";
}

export default function HeaderClient({
	isLoggedIn,
	user,
	teams = [],
	currentTeamId,
	userRole,
	variant = "desktop",
}: HeaderProps) {
	const router = useRouter();
	const pathname = usePathname() ?? "/";
	const locale = useLocale();
	const t = useTranslations("Common.nav");
	const tSearch = useTranslations("Common.search");
	const tTheme = useTranslations("Common.theme");
	const { theme, setTheme } = useTheme();
	const currentTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";
	const themeMeta = {
		light: { label: tTheme("light"), icon: Sun },
		dark: { label: tTheme("dark"), icon: Moon },
		system: { label: tTheme("system"), icon: Monitor },
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
	const [isMobileTeamDialogOpen, setIsMobileTeamDialogOpen] = useState(false);
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
	const activeTeam = teams.find((team) => team.id === activeWorkspaceId) ?? teams[0];

	useEffect(() => {
		setActiveTeamId(currentTeamId ?? teams[0]?.id);
	}, [currentTeamId, teams]);

	async function handleSignOut() {
		try {
			await postClientAuthSignOut();
		} catch (error) {
			console.error("Sign out error", error);
		} finally {
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
			toast.error(tSearch("failedSwitchWorkspace", { workspace: teamName }), {
				position: "bottom-right",
			});
			return false;
		}

		router.refresh();
		toast.success(tSearch("switchedWorkspace", { workspace: teamName }), {
			position: "bottom-right",
		});
		return true;
	}

	const navLinks = [
		{ href: "/models", label: t("models"), icon: Boxes },
		{ href: "/chat", label: t("chat"), icon: MessageSquare },
		{ href: "/compare", label: t("compare"), icon: Scale },
		{ href: "/api-providers", label: t("providers"), icon: Server },
		{ href: "/apps", label: t("apps"), icon: AppWindow },
		{ href: "/rankings", label: t("rankings"), icon: Trophy },
	];
	const docsHref = getLocalizedDocsHref(locale, "/v1");

	if (variant === "mobile") {
		if (!isLoggedIn) {
			return (
				<DropdownMenu
					open={isMobileNavOpen}
					onOpenChange={(open) => setIsMobileNavOpen(Boolean(open))}
				>
					<ButtonGroup className="h-8 items-stretch overflow-hidden rounded-lg shadow-xs">
						<Button asChild className="h-8 rounded-r-none px-4">
							<Link href="/sign-up">
								{t("signUp")}
							</Link>
						</Button>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 rounded-l-none border-l border-primary-foreground/25 px-0"
								aria-label={t("openNavigation")}
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
														{t("documentation")}
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<div className="px-1 py-1">
							<div
								role="radiogroup"
								aria-label={tTheme("mode")}
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
											aria-label={tTheme("set", { theme: themeMeta[mode].label })}
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
			<DropdownMenu
				open={isMobileNavOpen}
				onOpenChange={(open) => {
					const nextOpen = Boolean(open);
					setIsMobileNavOpen(nextOpen);
					if (!nextOpen) setIsMobileTeamDialogOpen(false);
				}}
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
						aria-label={t("openProfile")}
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
										<span>{t("internal")}</span>
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{isLoggedIn && teams.length > 0 && (
							<>
								<Popover
									modal={false}
									open={isMobileTeamDialogOpen}
									onOpenChange={(open) =>
										setIsMobileTeamDialogOpen(Boolean(open))
									}
								>
									<PopoverTrigger asChild>
										<button
											type="button"
											className={cn(
												"relative flex min-h-7 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-hidden transition-colors",
												"hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
												isMobileTeamDialogOpen && "bg-accent text-accent-foreground",
											)}
										>
											<Users className="h-4 w-4" />
											<span className="min-w-0 flex-1 truncate">
												{activeTeam?.name ?? "Workspace"}
											</span>
											<ChevronDown
												className={cn(
													"ml-auto h-4 w-4 text-zinc-500 transition-transform",
													isMobileTeamDialogOpen && "rotate-180",
												)}
											/>
										</button>
									</PopoverTrigger>
									<PopoverContent
										side="bottom"
										align="start"
										sideOffset={6}
										className="w-56 gap-0 rounded-lg p-1"
									>
										{teams.slice(0, 5).map((team) => {
											const isActive = team.id === activeWorkspaceId;
											return (
												<button
													key={team.id}
													type="button"
													className={cn(
														"flex min-h-7 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden transition-colors",
														"hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
														isActive && "bg-accent text-accent-foreground",
													)}
													onClick={() => {
														void handleTeamSwitch(team.id, team.name).then((ok) => {
															if (ok) setIsMobileTeamDialogOpen(false);
														});
													}}
												>
													<span
														className={cn(
															"truncate",
															isActive && "text-foreground",
														)}
													>
														{team.name}
													</span>
													{isActive && <Check className="ml-auto h-4 w-4 text-primary" />}
												</button>
											);
										})}
										<DropdownMenuSeparator />
										<Link
											href="/settings/workspaces/settings"
											prefetch={false}
											className={cn(
												"flex min-h-7 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden transition-colors",
												"hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
											)}
											onClick={() => setIsMobileTeamDialogOpen(false)}
										>
											<Users className="h-4 w-4" />
										<span>{t("manageWorkspaces")}</span>
										</Link>
									</PopoverContent>
								</Popover>
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
									<span>{t("experiments")}</span>
								</Link>
							</DropdownMenuItem>

							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/workspaces/settings" prefetch={false}>
									<Users className="h-4 w-4" />
									<span>{t("workspaces")}</span>
								</Link>
							</DropdownMenuItem>

								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href="/settings/account" prefetch={false}>
										<Settings className="h-4 w-4" />
									<span>{t("settings")}</span>
								</Link>
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link
									href={`/settings/usage/overview?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false}
								>
									<Activity className="h-4 w-4" />
									<span>{t("activity")}</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link
									href={`/settings/usage/logs/requests?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false}
								>
									<ScrollText className="h-4 w-4" />
									<span>{t("logs")}</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/credits" prefetch={false}>
									<CreditCard className="h-4 w-4" />
									<span>{t("credits")}</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/settings/keys" prefetch={false}>
									<KeyIcon className="h-4 w-4" />
									<span>{t("keys")}</span>
								</Link>
							</DropdownMenuItem>
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href="/contact" prefetch={false}>
										<LifeBuoy className="h-4 w-4" />
										<span className="flex min-w-0 flex-1 items-center justify-between gap-3">
													<span>{t("support")}</span>
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
								<DropdownMenuItem
									className="cursor-pointer rounded-lg text-sm"
									onClick={() => {
										setIsMobileNavOpen(false);
										setIsFeedbackOpen(true);
									}}
								>
									<MessageSquareMore className="h-4 w-4" />
									<span>{t("sendFeedback")}</span>
								</DropdownMenuItem>
								<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
									<Link href={docsHref} target="_blank" rel="noreferrer">
										<BookOpenText className="h-4 w-4" />
										<span>{t("documentation")}</span>
									</Link>
								</DropdownMenuItem>

								<DropdownMenuSeparator />

								<div className="px-1 py-1">
									<div
										role="radiogroup"
										aria-label={tTheme("mode")}
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
													aria-label={tTheme("set", { theme: themeMeta[mode].label })}
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
								<span>{t("signOut")}</span>
							</DropdownMenuItem>
						</>
					) : (
						<>
							<DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm">
								<Link href="/sign-up">
									{t("signUp")}
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<div className="px-1 py-1">
								<div
									role="radiogroup"
									aria-label={tTheme("mode")}
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
											aria-label={tTheme("set", { theme: themeMeta[mode].label })}
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
						onSignOut={handleSignOut}
						initialActiveTeamId={currentTeamId}
					/>
				</>
			) : (
				<Link href="/sign-up">
					<Button
						variant="default"
						className="rounded-lg px-4 py-2 text-xs font-semibold"
					>
						{t("signUp")}
					</Button>
				</Link>
			)}
		</div>
	);
}
