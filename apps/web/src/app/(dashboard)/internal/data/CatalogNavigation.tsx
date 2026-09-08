"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Bot, Building2, Route, Gauge } from "lucide-react";

const collections = [
	{ label: "Overview", href: "/internal/data", icon: Database },
	{ label: "Models", href: "/internal/data/models", icon: Bot },
	{ label: "Organisations", href: "/internal/data/organisations", icon: Building2 },
	{ label: "Providers", href: "/internal/data/api-providers", icon: Route },
	{ label: "Benchmarks", href: "/internal/data/benchmarks", icon: Gauge },
];

export function CatalogNavigation() {
	const pathname = usePathname();
	return <nav aria-label="Catalog collections" className="flex gap-1 overflow-x-auto border-b py-2">
		{collections.map(({ label, href, icon: Icon }) => {
			const active = href === "/internal/data" ? pathname === href : pathname.startsWith(href);
			return <Link key={href} href={href} aria-current={active ? "page" : undefined}
				className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
				<Icon className="size-4" />{label}
			</Link>;
		})}
	</nav>;
}
