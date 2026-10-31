"use client";

import type { ReactNode } from "react";
import type scopes from "@/i18n/lazy-message-scopes.json";

/** Optional tools used to fetch their copy on mount; web-start pages already carry the full catalogue. */
export function LazyMessages({ children }: { feature: keyof typeof scopes; children: ReactNode }) {
	return <>{children}</>;
}
