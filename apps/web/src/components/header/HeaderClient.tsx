// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	BarChart2,
	Boxes,
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
import TeamSwitcher from "./TeamSwitcher";
import { setActiveWorkspaceAction } from "@/app/(dashboard)/actions";
import { createClient } from "@/utils/supabase/client";
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
	workspaces?: { id: string; name: string }[];
	currentWorkspaceId?: string;
	userRole?: string | undefined;
	variant?: "mobile" | "desktop";
}

function emitWorkspaceChanged(workspaceId: string) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent("workspace:changed", {
			detail: { workspaceId },
		}),
	);
}

export default function HeaderClient({
	isLoggedIn,
	user,
	workspaces = [],
	currentWorkspaceId,
	userRole,
	variant = "desktop",
}: HeaderProps) {
	const router = useRouter();
	const pathname = usePathname();
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
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(
		currentWorkspaceId ?? workspaces[0]?.id,
	);
	const workspacesHref = `/settings/workspaces${
		activeWorkspaceId
			? `?workspace_id=${encodeURIComponent(activeWorkspaceId)}`
			: ""
	}`;
	const [isMobileWorkspaceDialogOpen, setIsMobileWorkspaceDialogOpen] = useState(false);
	const activeWorkspace =
		workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
		workspaces[0];

	useEffect(() => {
		setActiveWorkspaceId(currentWorkspaceId ?? workspaces[0]?.id);
	}, [currentWorkspaceId, workspaces]);

	async function handleSignOut() {
		try {
			const supabase = createClient();
			const { error } = await supabase.auth.signOut();
			if (error) console.error("Sign out error", error);
		} finally {
			router.push("/");
			router.refresh();
		}
	}

	async function handleWorkspaceSwitch(nextWorkspaceId: string, workspaceName: string) {
		if (nextWorkspaceId === activeWorkspaceId) return true;

		const previousWorkspaceId = activeWorkspaceId;
		setActiveWorkspaceId(nextWorkspaceId);

		const result = await setActiveWorkspaceAction(nextWorkspaceId);
		if (!result?.ok) {
			setActiveWorkspaceId(previousWorkspaceId);
			const reason =
				typeof result?.error === "string" && result.error
					? ` (${result.error})`
					: "";
			toast.error(`Failed to switch to ${workspaceName} workspace${reason}`, {
				position: "bottom-right",
			});
			return false;
		}

		emitWorkspaceChanged(nextWorkspaceId);
		router.refresh();
		toast.success(`Switched to ${workspaceName} workspace`, {
			position: "bottom-right",
		});
		return true;
	}

	const navLinks = [
		{ href: "/models", label: "Models", icon: Boxes },
		{ href: "/api-providers", label: "Providers", icon: Server },
		{ href: "/apps", label: "Apps", icon: AppWindow },
		{ href: "/rankings", label: "Rankings", icon: Trophy },
		{ href: "/chat", label: "Playground", icon: MessageSquare },
	];

	if (variant === "mobile") {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="group overflow-hidden"
						aria-label="Toggle menu"
					>
						<span className="relative block h-5 w-5 overflow-hidden" aria-hidden="true">
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center -translate-y-[6px] rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:translate-y-0 group-data-[state=open]:rotate-45" />
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:opacity-0" />
							<span className="absolute left-0 top-1/2 h-0.5 w-5 origin-center translate-y-[6px] rounded-full bg-current transition-all duration-200 ease-out group-data-[state=open]:translate-y-0 group-data-[state=open]:-rotate-45" />
						</span>
					</Button>
				</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
						{isLoggedIn && workspaces.length > 0 && (
							<>
								<Popover
									modal={false}
									open={isMobileWorkspaceDialogOpen}
									onOpenChange={setIsMobileWorkspaceDialogOpen}
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
												{activeWorkspace?.name ?? "Workspace"}
											</span>
											<ChevronDown
												className={cn(
													"ml-auto h-4 w-4 text-zinc-500 transition-transform",
													isMobileWorkspaceDialogOpen && "rotate-180",
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
										{workspaces.slice(0, 5).map((workspace) => {
											const isActive = workspace.id === activeWorkspaceId;
											return (
												<button
													key={workspace.id}
													type="button"
													className={cn(
														"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors",
														"hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
													)}
													onClick={() => {
														void handleWorkspaceSwitch(workspace.id, workspace.name).then((ok) => {
															if (ok) setIsMobileWorkspaceDialogOpen(false);
														});
													}}
												>
													<span
														className={cn(
															"truncate",
															isActive && "text-foreground",
														)}
													>
														{workspace.name}
													</span>
													{isActive && <Check className="ml-auto h-4 w-4 text-primary" />}
												</button>
											);
										})}
										<DropdownMenuSeparator />
										<Link
											href={workspacesHref}
											prefetch={false}
											className={cn(
												"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors",
												"hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
											)}
											onClick={() => setIsMobileWorkspaceDialogOpen(false)}
										>
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
								asChild
								className={cn(
									"rounded-md py-1.5 text-sm",
									isActive && "font-semibold text-blue-500",
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
							{(userRole === "editor" || userRole === "admin") && (
								<>
									<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
										<Link href="/internal" prefetch={false}>
											<Lock className="h-4 w-4" />
											<span>Internal</span>
										</Link>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}

							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/experiments" prefetch={false}>
									<FlaskConical className="h-4 w-4" />
									<span>Experiments</span>
								</Link>
							</DropdownMenuItem>

								<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
									<Link href="/settings/account" prefetch={false}>
										<Settings className="h-4 w-4" />
									<span>Settings</span>
								</Link>
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link
									href={`/settings/usage?workspace_id=${encodeURIComponent(
										activeWorkspaceId ?? "",
									)}`}
									prefetch={false}
								>
									<BarChart2 className="h-4 w-4" />
									<span>Usage</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/settings/credits" prefetch={false}>
									<CreditCard className="h-4 w-4" />
									<span>Credits</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/settings/keys" prefetch={false}>
									<KeyIcon className="h-4 w-4" />
									<span>Keys</span>
								</Link>
							</DropdownMenuItem>
							{workspaces.length === 0 && (
								<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
									<Link href={workspacesHref} prefetch={false}>
										<Users className="h-4 w-4" />
										<span>Workspaces</span>
									</Link>
								</DropdownMenuItem>
							)}
								<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
									<Link href="/contact" prefetch={false}>
										<LifeBuoy className="h-4 w-4" />
										<span>Support</span>
									</Link>
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
								onSelect={(event) => {
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
							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/sign-in" prefetch={false}>
									Sign in
								</Link>
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
				<TeamSwitcher
					user={user}
					workspaces={workspaces}
					userRole={userRole}
					onSignOut={handleSignOut}
					initialActiveWorkspaceId={currentWorkspaceId}
				/>
			) : (
				<Link href="/sign-in" prefetch={false}>
					<Button
						variant="outline"
						className="rounded-lg px-4 py-2 text-xs font-semibold"
					>
						Sign In
					</Button>
				</Link>
			)}
		</div>
	);
}
