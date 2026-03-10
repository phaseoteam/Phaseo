// components/header/HeaderClient.tsx  (CLIENT)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import TeamSwitcher from "./TeamSwitcher";
import { createClient } from "@/utils/supabase/client";
import {
	Drawer,
	DrawerTrigger,
	DrawerContent,
	DrawerClose,
	DrawerTitle,
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
			router.refresh();
		}
	}

	const navLink = (href: string, label: string) => (
		<DrawerClose asChild key={href}>
			<Button asChild variant="ghost" className="justify-start rounded-lg text-md">
				<Link
					href={href}
					prefetch={false}
					className={cn(
						"text-sm font-medium transition-colors hover:text-primary",
						pathname === href || pathname.startsWith(href + "/")
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
		navLink("/models", "Models"),
		navLink("/api-providers", "Providers"),
		navLink("/rankings", "Rankings"),
		navLink("/chat", "Chat"),
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
					<DrawerTitle className="sr-only">Navigation menu</DrawerTitle>
					<div className="pt-4">
						<nav className="flex flex-col gap-2 px-6 pb-4">{navLinks}</nav>
						<div className="mt-auto border-t px-6 py-4">
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
								<Link href="/sign-in" prefetch={false} className="block w-full">
									<Button
										className="w-full rounded-lg px-4 py-2 text-xs font-semibold"
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



