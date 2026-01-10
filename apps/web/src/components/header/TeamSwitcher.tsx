// components/header/TeamSwitcher.tsx (CLIENT)
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
        ChevronDown,
        LogOut,
        CreditCard,
        Key as KeyIcon,
        BarChart2,
        Check,
        Settings,
        LifeBuoy,
        Users,
        MessageCircle,
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
import { openHeyo } from "@/lib/heyo-client";
import { getLondonInfo, getSupportAvailability } from "@/lib/support/schedule";

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
	const [open, setOpen] = useState(false);

	const getInitialTeamId = (initial?: string) => {
		if (initial) return initial;
		return teams.length ? teams[0].id : undefined;
	};

	const [activeTeamId, setActiveTeamId] = useState<string | undefined>(() =>
		getInitialTeamId(initialActiveTeamId)
	);

	const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0];
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
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					aria-expanded={open}
					aria-label="Open team switcher"
					className={cn(
						"inline-flex items-center gap-2 rounded-full px-3 py-1.5 leading-none",
						"border border-transparent text-sm font-medium text-foreground",
						"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
						"data-[state=open]:bg-zinc-100/90 dark:data-[state=open]:bg-zinc-900/70"
					)}
				>
					<CurrentUserAvatar />
					<span
						className="hidden sm:inline-block text-sm font-medium select-none"
						title={activeTeam ? activeTeam.name : undefined}
					>
						{activeTeam ? activeTeam.name : "Unknown Team"}
					</span>
					<ChevronDown
						className={cn(
							"h-4 w-4 transition-transform duration-150",
							open && "rotate-180"
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
				{/* Editor access for editors and admins */}
				{(userRole === "editor" || userRole === "admin") && (
					<>
						<DropdownMenuItem
							className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
							onSelect={(e) => {
								e.preventDefault();
								setOpen(false);
								router.push("/internal");
							}}
						>
							<Settings className="h-4 w-4" />
							<span className="mr-2">Internal</span>
						</DropdownMenuItem>
						<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />
					</>
				)}

				{teams.length > 0 && (
					<div>
						{teams.slice(0, 5).map((t) => {
							const isActive = t.id === activeTeamId;
							return (
								<DropdownMenuItem
									key={t.id}
									className={cn(
										"rounded-md text-sm",
										"focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground",
										"py-1.5"
									)}
									onSelect={async (e) => {
										e.preventDefault();
										const previous = activeTeamId;
										setActiveTeamId(t.id);
										try {
											const res = await SwapTeam(t.id);
											if (res?.ok) {
												router.refresh();
											} else {
												setActiveTeamId(previous);
											}
										} catch {
											setActiveTeamId(previous);
										} finally {
											setOpen(false);
										}
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
						<DropdownMenuItem className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground">
							<Link
								href="/settings/teams"
								className="flex w-full items-center"
								onClick={() => setOpen(false)}
							>
								<Users className="mr-2 h-4 w-4" />
								<span>Manage Teams</span>
							</Link>
						</DropdownMenuItem>
						<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />
					</div>
				)}

                                <DropdownMenuItem className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground">
                                        <Link
                                                href="/chat"
                                                className="flex w-full items-center"
                                                onClick={() => setOpen(false)}
                                        >
                                                <MessageCircle className="mr-2 h-4 w-4" />
                                                <span>Chat</span>
                                        </Link>
                                </DropdownMenuItem>

                                <DropdownMenuItem className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground">
                                        <Link
                                                href="/settings/credits"
                                                className="flex w-full items-center"
                                                onClick={() => setOpen(false)}
					>
						<CreditCard className="mr-2 h-4 w-4" />
						<span>Credits</span>
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground">
					<Link
						href="/settings/keys"
						className="flex w-full items-center"
						onClick={() => setOpen(false)}
					>
						<KeyIcon className="mr-2 h-4 w-4" />
						<span>Keys</span>
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground">
					<Link
						href={`/gateway/usage?team_id=${encodeURIComponent(
							activeTeamId ?? ""
						)}`}
						className="flex w-full items-center"
						onClick={() => setOpen(false)}
					>
						<BarChart2 className="mr-2 h-4 w-4" />
						<span>Usage</span>
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem
					className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					onSelect={(e) => {
						e.preventDefault();
						setOpen(false);
						openHeyo();
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
											.find((c) => c.startsWith("ring-"))
											?.replace("ring-", "bg-")
											.replace("/60", "") || ""
									} opacity-75`}
								></span>
							)}
							<span
								className={`relative inline-flex h-full w-full rounded-full ${
									supportDotClasses
										.split(" ")
										.find((c) => c.startsWith("bg-")) || ""
								}`}
							></span>
						</span>
					</div>
				</DropdownMenuItem>

				<hr className="my-1 border-zinc-200/70 dark:border-zinc-800" />

				<DropdownMenuItem
					className="rounded-md py-1.5 text-sm focus:bg-zinc-100/80 dark:focus:bg-zinc-900/70 focus:text-foreground"
					onSelect={(e) => {
						e.preventDefault();
						setOpen(false);
						onSignOut?.();
					}}
				>
					<LogOut className="mr-2 h-4 w-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
