"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Database, Bot, Building2, Route, Gauge } from "lucide-react";

export function CatalogNavigation() {
	const pathname = usePathname();
	const t = useTranslations();
	const collections = [
		{ label: t("SettingsUI.strings.Overview"), href: "/internal/data", icon: Database },
		{ label: t("Common.nav.models"), href: "/internal/data/models", icon: Bot },
		{ label: t("Catalogue.countries.organisations"), href: "/internal/data/organisations", icon: Building2 },
		{ label: t("Common.nav.providers"), href: "/internal/data/api-providers", icon: Route },
		{ label: t("Common.ui.pricingEditorCopy.providerUpdates"), href: "/internal/data/imports", icon: Route },
		{ label: t("Common.nav.settings"), href: "/internal/data/registries", icon: Database },
		{ label: t("Catalogue.benchmarks.title"), href: "/internal/data/benchmarks", icon: Gauge },
	];
	return <nav aria-label={t("SettingsUI.newMainSettingsCopy.catalogCollections")} className="flex gap-1 overflow-x-auto border-b py-2">
		{collections.map(({ label, href, icon: Icon }) => {
			const active = href === "/internal/data" ? pathname === href : pathname.startsWith(href);
			return <Link key={href} href={href} aria-current={active ? "page" : undefined}
				className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
				<Icon className="size-4" />{label}
			</Link>;
		})}
	</nav>;
}
