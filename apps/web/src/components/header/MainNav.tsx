"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const LINKS = [
	{ href: "/models", key: "models" },
	{ href: "/chat", key: "chat" },
	{ href: "/compare", key: "compare" },
	{ href: "/api-providers", key: "providers" },
	{ href: "/apps", key: "apps" },
	{ href: "/rankings", key: "rankings" },
] as const;

export default function MainNav() {
	const pathname = usePathname() ?? "/";
	const t = useTranslations("Common.nav");

	return (
		<nav className="flex items-center gap-1 xl:gap-1.5">
			{LINKS.map(({ href, key }) => {
				const isActive = pathname === href || pathname.startsWith(href + "/");

				return (
					<Link
						key={href}
						href={href}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"inline-flex h-[var(--site-header-control-h,2.5rem)] items-center whitespace-nowrap rounded-lg px-[var(--site-header-nav-px,0.75rem)] text-[13px] font-medium leading-none xl:text-sm",
							"select-none border border-transparent text-foreground",
							"transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
							isActive && "bg-zinc-100/90 text-foreground dark:bg-zinc-900/70"
						)}
					>
						{t(key)}
					</Link>
				);
			})}
		</nav>
	);
}
