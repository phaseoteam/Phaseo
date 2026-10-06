"use client";

import { usePathname } from "@/i18n/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import {
	getFooterVisibilitySnapshot,
	subscribeFooterVisibility,
} from "@/components/layout/footerVisibility";

const FOOTERLESS_ROUTE_PREFIXES = ["/chat", "/settings"] as const;

export function shouldShowDashboardFooter(pathname: string): boolean {
	return !FOOTERLESS_ROUTE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

export default function DashboardFooterGate({ children }: { children: ReactNode }) {
	const pathname = usePathname() ?? "/";
	const overridesAllowFooter = useSyncExternalStore(
		subscribeFooterVisibility,
		getFooterVisibilitySnapshot,
		() => true,
	);

	return shouldShowDashboardFooter(pathname) && overridesAllowFooter
		? children
		: null;
}
