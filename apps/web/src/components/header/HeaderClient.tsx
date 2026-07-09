// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	BarChart2,
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
	const { theme, setTheme } = useTheme();
	const currentTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";
	const themeMeta = {
		light: { label: "Light", icon: Sun },
		dark: { label: "Dark", icon: Moon },
		system: { label: "System", icon: Monitor },
	} as const;
	const [activeWorkspaceId, setActiveTeamId] = useState<string | undefined>(
		currentTeamId ?? teams[0]?.id,
	);
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const [isMobileTeamDialogOpen, setIsMobileTeamDialogOpen] = useState(false);
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
			toast.error(`Failed to switch to ${teamName} workspace`, {
				position: "bottom-right",
			});
			return false;
		}

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
	const docsHref = "https://docs.ai-stats.phaseo.app/v1";

	if (variant === "mobile") {
		if (!isLoggedIn) {
			return (
				<DropdownMenu open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
					<ButtonGroup className="h-8 items-stretch overflow-hidden rounded-2xl shadow-xs">
						<Button asChild className="h-8 rounded-r-none px-4">
							<Link href="/sign-up" prefetch={false}>
								Sign Up
							</Link>
						</Button>
						<DropdownMenuTrigger render={<Button
								className="h-8 w-8 rounded-l-none border-l border-primary-foreground/25 px-0"
								aria-label="Open navigation menu" />}>

								<ChevronDown
									className={cn(
										"size-4 transition-transform duration-150",
										isMobileNavOpen && "rotate-180"
									)}
									aria-hidden="true"
								/>

						</DropdownMenuTrigger>
					</ButtonGroup>
					<DropdownMenuContent align="end" className="w-48 rounded-xl p-1">
						{navLinks.map(({ href, label, icon: Icon }) => {
							const isActive =
								pathname === href || pathname.startsWith(href + "/");
							return (
								<DropdownMenuItem
									key={href}
									className={cn(
										"rounded-md py-2 text-sm",
										isActive && "font-semibold text-primary"
									)}
								 render={<Link href={href} prefetch={false} className="flex items-center gap-2" />}>

										<Icon className="h-4 w-4" />
										{label}

								</DropdownMenuItem>
							);
						})}
						<DropdownMenuItem className="rounded-md py-2 text-sm" render={<Link
								href={docsHref}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-2" />}>

								<BookOpenText className="h-4 w-4" />
								Docs

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
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button
						variant="ghost"
						size="icon"
						className="group overflow-hidden"
						aria-label="Toggle menu" />}>

						<span className="relative block h-5 w-5 overflow-hidden" aria-hidden="true">
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center -translate-y-[6px] rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:translate-y-0 group-data-[state=open]:rotate-45" />
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:opacity-0" />
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center translate-y-[6px] rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:translate-y-0 group-data-[state=open]:-rotate-45" />
						</span>

				</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
						{isLoggedIn && teams.length > 0 && (
							<>
								<Popover
									modal={false}
									open={isMobileTeamDialogOpen}
									onOpenChange={setIsMobileTeamDialogOpen}
								>
									<PopoverTrigger asChild>
										<button
											type="button"
											className={cn(
												"relative flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden transition-colors",
												"hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
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
										className="w-52 rounded-xl p-1"
									>
										{teams.slice(0, 5).map((team) => {
											const isActive = team.id === activeWorkspaceId;
											return (
												<button
													key={team.id}
													type="button"
													className={cn(
														"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors",
														"hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
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
												"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors",
												"hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
											)}
											onClick={() => setIsMobileTeamDialogOpen(false)}
										>
											<Users className="h-4 w-4" />
											<span>Manage Workspaces</span>
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
								className={cn(
									"rounded-md py-1.5 text-sm",
									isActive && "font-semibold text-blue-500",
								)}
							 render={<Link href={href} prefetch={false} className="flex items-center gap-2" />}>

									<Icon className="h-4 w-4" />
									<span>{label}</span>

							</DropdownMenuItem>
						);
					})}

					<DropdownMenuSeparator />

					{isLoggedIn ? (
						<>
							{(userRole === "editor" || userRole === "admin") && (
								<>
									<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/internal" prefetch={false} />}>

											<Lock className="h-4 w-4" />
											<span>Internal</span>

									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}

							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/experiments" prefetch={false} />}>

									<FlaskConical className="h-4 w-4" />
									<span>Experiments</span>

							</DropdownMenuItem>

							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/settings/workspaces/settings" prefetch={false} />}>

									<Users className="h-4 w-4" />
									<span>Workspaces</span>

							</DropdownMenuItem>

								<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/settings/account" prefetch={false} />}>

										<Settings className="h-4 w-4" />
									<span>Settings</span>

							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link
									href={`/settings/usage?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false} />}>

									<BarChart2 className="h-4 w-4" />
									<span>Usage</span>

							</DropdownMenuItem>
							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/settings/credits" prefetch={false} />}>

									<CreditCard className="h-4 w-4" />
									<span>Credits</span>

							</DropdownMenuItem>
							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/settings/keys" prefetch={false} />}>

									<KeyIcon className="h-4 w-4" />
									<span>Keys</span>

							</DropdownMenuItem>
								<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/contact" prefetch={false} />}>

										<LifeBuoy className="h-4 w-4" />
										<span>Support</span>

								</DropdownMenuItem>
								<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href={docsHref} target="_blank" rel="noreferrer" />}>

										<BookOpenText className="h-4 w-4" />
										<span>Docs</span>

								</DropdownMenuItem>

								<DropdownMenuSeparator />

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
															: "bg-transparent dark:text-zinc-300",
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
									className="rounded-md py-1.5 text-sm"
								onClick={(event) => {
									event.preventDefault();
									void handleSignOut();
								}}
							>
								<LogOut className="h-4 w-4" />
								<span>Sign out</span>
							</DropdownMenuItem>
						</>
					) : (
						<>
							<DropdownMenuItem className="rounded-md py-1.5 text-sm" render={<Link href="/sign-up" prefetch={false} />}>

									Sign Up

							</DropdownMenuItem>
							<DropdownMenuSeparator />
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
														: "bg-transparent dark:text-zinc-300",
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
				<Link href="/sign-up" prefetch={false}>
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
