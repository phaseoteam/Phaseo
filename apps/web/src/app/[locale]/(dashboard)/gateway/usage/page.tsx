import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.gateway");
	return { title: t("usageRedirectTitle"), description: t("usageRedirectDescription"), robots: { index: false, follow: false } };
}

export default async function Page(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = await props.searchParams;

	const params = new URLSearchParams();
	if (sp) {
		for (const [k, v] of Object.entries(sp)) {
			if (k === "tab") continue;
			if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
			else if (typeof v === "string") params.append(k, v);
		}
	}

	const tab =
		typeof sp?.tab === "string"
			? sp.tab
			: Array.isArray(sp?.tab)
				? sp.tab[0]
				: undefined;
	const normalizedTab = (tab ?? "").toLowerCase();
	const target =
		normalizedTab === "trends" ||
		normalizedTab === "explore" ||
		normalizedTab === "guardrails"
			? `/settings/usage/${normalizedTab}`
			: "/settings/usage/overview";
	const qs = params.toString();
	const locale = await getLocale();
	const localizedTarget = locale === "en-GB" ? target : `/${locale}${target}`;
	permanentRedirect(qs ? `${localizedTarget}?${qs}` : localizedTarget);
}
