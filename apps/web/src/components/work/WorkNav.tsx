"use client";

import { AlertTriangle, Inbox, MessageSquare, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
	{ href: "/work", key: "inbox", icon: Inbox },
	{ href: "/work/requests", key: "requests", icon: MessageSquare },
	{ href: "/work/customers", key: "customers", icon: Users },
	{ href: "/work/errors", key: "errors", icon: AlertTriangle },
	{ href: "/work/settings", key: "settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
	if (href === "/work") return pathname === "/work" || /^\/work\/\d+/.test(pathname);
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkNav() {
	const t = useTranslations("Work.nav");
	const pathname = usePathname();
	return (
		<nav aria-label={t("label")} className="flex gap-1 overflow-x-auto border-b">
			{SECTIONS.map(({ href, key, icon: Icon }) => {
				const active = isActive(pathname, href);
				return (
					<Link
						key={href}
						href={href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
							active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" aria-hidden="true" />
						{t(key)}
					</Link>
				);
			})}
		</nav>
	);
}
