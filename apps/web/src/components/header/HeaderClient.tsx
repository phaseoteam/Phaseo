// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import TeamSwitcher from "./TeamSwitcher";
import { createClient } from "@/utils/supabase/client"; // client SDK is fine here
import {
	Drawer,
	DrawerTrigger,
	DrawerContent,
	DrawerClose,
} from "@/components/ui/drawer";

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
			router.refresh(); // ensure AuthControls re-renders
		}
	}

	const navLink = (href: string, label: string) => (
		<DrawerClose asChild key={href}>
			<Button asChild variant="ghost" className="text-md rounded-lg">
				<Link
					href={href}
					className={cn(
						"text-sm font-medium transition-colors hover:text-primary",
						// For the root path ('/'), only mark active on exact match.
						// For other paths, match when pathname === href or when the pathname
						// starts with the href followed by a slash, which avoids marking
						// the link active for partial prefixes (e.g. '/models' vs '/modelx').
						(() => {
							if (href === "/") return pathname === "/";
							return (
								pathname === href ||
								pathname.startsWith(href + "/")
							);
						})()
							? "text-blue-500"
							: "text-foreground"
					)}
				>
					{label}
				</Link>
			</Button>
		</DrawerClose>
	);

	const navLinks = [
		navLink("/", "Home"),
		navLink("/compare", "Comparisons"),
		navLink("/organisations", "Organisations"),
		navLink("/models", "Models"),
		navLink("/benchmarks", "Benchmarks"),
		navLink("/api-providers", "API Providers"),
	];

	if (variant === "mobile") {
		return (
			<Drawer>
				<DrawerTrigger asChild>
					<Button variant="ghost" size="icon" aria-label="Open menu">
						<Menu className="h-6 w-6" />
					</Button>
				</DrawerTrigger>
				<DrawerContent>
					<div className="pt-4">
						<nav className="flex flex-col gap-2 px-6 pb-4">
							{navLinks}
						</nav>
						<div className="px-6 py-4 mt-auto border-t">
							{isLoggedIn ? (
								<div className="flex justify-end">
									<TeamSwitcher
										user={user}
										teams={teams}
										userRole={userRole}
										onSignOut={handleSignOut}
										initialActiveTeamId={currentTeamId}
									/>
								</div>
							) : (
								<Link href="/sign-in" className="w-full block">
									<Button
										className="w-full rounded-lg text-xs px-4 py-2 font-semibold"
										variant="outline"
									>
										Sign In
									</Button>
								</Link>
							)}
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	// desktop: only auth controls; nav lives in MainNav
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
				<Link href="/sign-in">
					<Button
						variant="outline"
						className="rounded-lg text-xs px-4 py-2 font-semibold"
					>
						Sign In
					</Button>
				</Link>
			)}
		</div>
	);
}
