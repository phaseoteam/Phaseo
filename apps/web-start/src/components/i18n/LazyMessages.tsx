"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations, type AbstractIntlMessages } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { FeatureMessagesProvider } from "./LocaleMessagesProvider";
import type scopes from "@/i18n/lazy-message-scopes.json";

/** Optional tools fetch their own copy when mounted, never on anonymous pages. */
export function LazyMessages({ feature, children }: { feature: keyof typeof scopes; children: ReactNode }) {
	const locale = useLocale();
	const t = useTranslations("Common.errors");
	const query = useQuery({
		queryKey: ["lazyMessages", locale, feature],
		queryFn: async ({ signal }): Promise<AbstractIntlMessages> => {
			const response = await fetch(`/api/i18n/${encodeURIComponent(locale)}/${feature}`, { signal });
			if (!response.ok) throw new Error("Translation loading failed");
			return response.json();
		},
		staleTime: Infinity,
	});
	if (query.isPending) return null;
	if (query.isError) return <button type="button" onClick={() => void query.refetch()}>{t("tryAgain")}</button>;
	return <FeatureMessagesProvider messages={query.data}>{children}</FeatureMessagesProvider>;
}
