// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	BarChart2,
	CreditCard,
	Key as KeyIcon,
	LifeBuoy,
	Lock,
	LogOut,
	Menu,
	Settings,
	Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import TeamSwitcher from "./TeamSwitcher";
import { createClient } from "@/utils/supabase/client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
	const pathname = usePathname();

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

	const navLinks = [
		{ href: "/models", label: "Models" },
		{ href: "/api-providers", label: "Providers" },
		{ href: "/rankings", label: "Rankings" },
		{ href: "/chat", label: "Chat" },
	];

	if (variant === "mobile") {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" aria-label="Open menu">
						<Menu className="h-6 w-6" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-36 rounded-xl p-1">
					{navLinks.map(({ href, label }) => {
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
								<Link href={href} prefetch={false}>
									{label}
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
								<Link href="/settings/account" prefetch={false}>
									<Settings className="h-4 w-4" />
									<span>Settings</span>
								</Link>
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link
									href={`/settings/usage?team_id=${encodeURIComponent(
										currentTeamId ?? "",
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
							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/settings/teams" prefetch={false}>
									<Users className="h-4 w-4" />
									<span>Teams</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
								<Link href="/contact" prefetch={false}>
									<LifeBuoy className="h-4 w-4" />
									<span>Support</span>
								</Link>
							</DropdownMenuItem>

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
						<DropdownMenuItem asChild className="rounded-md py-1.5 text-sm">
							<Link href="/sign-in" prefetch={false}>
								Sign in
							</Link>
						</DropdownMenuItem>
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
					teams={teams}
					userRole={userRole}
					onSignOut={handleSignOut}
					initialActiveTeamId={currentTeamId}
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
