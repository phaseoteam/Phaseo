// components/header/TeamSwitcher.tsx (CLIENT)
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
	LogOut,
	CreditCard,
	Key as KeyIcon,
	Activity,
	Logs,
	Settings,
	LifeBuoy,
	Lock,
	FlaskConical,
	Sun,
	Moon,
	Monitor,
	MessageSquareMore,
	Sparkles,
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
import { isPublicDataPathname } from "@/lib/publicDataRoutes";
import { clearAccountQueryScope } from "@/lib/query/invalidation";
import { toAccountQueryScope } from "@/lib/query/queryKeys";
import { WorkspaceCombobox } from "./WorkspaceCombobox";
import { setActionDockEnabled, useActionDockEnabled } from "@/lib/actionDockPreferences";

interface TeamSwitcherProps {
	user?: any;
	teams?: { id: string; name: string }[];
	onSignOut?: () => void;
	initialActiveTeamId?: string;
	userRole?: string | undefined;
	providerMode?: boolean;
}

export default function TeamSwitcher({
	user,
	teams = [],
	onSignOut,
	initialActiveTeamId,
	userRole,
	providerMode = false,
}: TeamSwitcherProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const pathname = usePathname();
	const isPublicDataPage = isPublicDataPathname(pathname);
	const { theme, setTheme } = useTheme();

	const getInitialTeamId = (initial?: string) => {
		if (initial) return initial;
		return teams.length ? teams[0].id : undefined;
	};

	const [activeWorkspaceId, setActiveTeamId] = useState<string | undefined>(() =>
		getInitialTeamId(initialActiveTeamId)
	);
	const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
	const canUseActionDock = providerMode || userRole?.toLocaleLowerCase() === "admin";
	const actionDockEnabled = useActionDockEnabled(user?.id);

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
		setIsProfileMenuOpen(false);
	}, [pathname]);

	async function handleWorkspaceSelect(team: { id: string; name: string }) {
		if (team.id === activeWorkspaceId) return true;

		const previous = activeWorkspaceId;
		setActiveTeamId(team.id);
		const switchPromise = SwapTeam(team.id).then((result) => {
			if (!result?.ok) throw new Error("Failed to switch workspace");
			clearAccountQueryScope(
				queryClient,
				toAccountQueryScope({ userId: user?.id, workspaceId: previous }),
			);
			router.refresh();
			return result;
		});
		toast.promise(switchPromise, {
			loading: "Switching workspace...",
			success: `Switched to ${team.name} workspace`,
			error: `Failed to switch to ${team.name} workspace, please try again`,
		});
		try {
			await switchPromise;
			return true;
		} catch {
			setActiveTeamId(previous);
			return false;
		}
	}

	return (
		<div className="flex items-center gap-2">
			{providerMode ? (
				<Button asChild variant="ghost">
					<Link href="/settings/provider/models">Manage catalog</Link>
				</Button>
			) : (
				<WorkspaceCombobox
					workspaces={teams}
					activeWorkspaceId={activeWorkspaceId}
					onSelect={handleWorkspaceSelect}
				/>
			)}

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
											aria-label={`Set theme: ${themeMeta[mode].label}`}
											onClick={() => setTheme(mode)}
											className={cn(
												"relative flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors",
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
						className="cursor-pointer rounded-lg"
					>
						<Link
							href="/experiments"
						>
							<FlaskConical className="h-4 w-4" />
							<span>Experiments</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem
						asChild
						className="cursor-pointer rounded-lg"
					>
						<Link href="/settings/account">
							<Settings className="h-4 w-4" />
							<span>Settings</span>
						</Link>
					</DropdownMenuItem>
					{user?.id && canUseActionDock && !actionDockEnabled ? (
						<DropdownMenuItem
							className="cursor-pointer rounded-lg"
							onClick={() => {
								setActionDockEnabled(user.id, true);
								setIsProfileMenuOpen(false);
							}}
						>
							<Sparkles className="h-4 w-4" />
							<span>Turn on Phaseo action dock</span>
						</DropdownMenuItem>
					) : null}

					<DropdownMenuSeparator />

					{!providerMode && <>
					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link
							href={`/settings/usage/overview?workspace_id=${encodeURIComponent(
								activeWorkspaceId ?? "",
							)}`}
						>
							<Activity className="h-4 w-4" />
							<span>Activity</span>
						</Link>
					</DropdownMenuItem>

					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link
							href={`/settings/usage/logs/requests?workspace_id=${encodeURIComponent(
								activeWorkspaceId ?? "",
							)}`}
						>
							<Logs className="h-4 w-4" />
							<span>Logs</span>
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
							<span>Credits</span>
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
							<span>Keys</span>
						</Link>
					</DropdownMenuItem>
					</>}

					<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
						<Link href="/contact" className="flex w-full items-center justify-between">
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
						</Link>
					</DropdownMenuItem>
					{!isPublicDataPage ? (
						<DropdownMenuItem
							className="cursor-pointer rounded-lg"
							onClick={() => {
								setIsProfileMenuOpen(false);
								setIsFeedbackOpen(true);
							}}
						>
							<MessageSquareMore className="h-4 w-4" />
							<span>Send Feedback</span>
						</DropdownMenuItem>
					) : null}

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
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ProductFeedbackDialog
				open={isFeedbackOpen}
				onOpenChange={setIsFeedbackOpen}
				surface="profile_menu"
				prompt="Tell us what should be clearer, faster, or more useful across Phaseo."
			/>
		</div>
	);
}
