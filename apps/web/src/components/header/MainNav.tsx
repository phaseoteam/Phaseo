// components/header/MainNav.tsx (CLIENT)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
	{ href: "/", label: "Home", exact: true },
	{ href: "/organisations", label: "Organisations" },
	{ href: "/models", label: "Models" },
	{ href: "/benchmarks", label: "Benchmarks" },
	{ href: "/api-providers", label: "API Providers" },
];

export default function MainNav() {
	const pathname = usePathname();

	return (
		<nav className="flex items-center gap-1.5">
			{LINKS.map(({ href, label, exact }) => {
				const isActive = exact
					? pathname === href
					: pathname === href || pathname.startsWith(href + "/");

				return (
					<Link
						key={href}
						href={href}
						prefetch={false}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							// layout: no fixed height -> no clipping
							"inline-flex items-center whitespace-nowrap rounded-lg px-3 h-10 text-sm font-medium leading-none",
							// make text non-selectable while keeping link clickable
							"select-none",
							// ghost base -- use full foreground so inactive links aren't gray
							"border border-transparent text-foreground",
							// hover (same hue for both themes)
							"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							// focus
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
							// active (same colour family, just a touch stronger)
							isActive &&
								"bg-zinc-100/90 dark:bg-zinc-900/70 text-foreground"
						)}
					>
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
