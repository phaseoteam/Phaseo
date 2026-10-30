import { Suspense, use } from "react";
import { Link, redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { useLocale, useTranslations } from "next-intl";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { KeyDetailView } from "@/components/(gateway)/settings/keys/KeyDetailView";
import { keyDetailQuery } from "./keyDetail.functions";
import { keyDetailHref, matchesKeyRouteName } from "@/components/(gateway)/settings/keys/keyDetailHref";
export async function generateMetadata() { const t = await getTranslations("SettingsUI.headers"); return { title: t("apiKeys") }; }

// The 404 / sign-in / canonical-name redirects also run in the route's beforeLoad.
function KeyDetailPage({ params, searchParams }: { params: Promise<{ keyName: string }>; searchParams: Promise<{ workspaceId?: string; prefix?: string }> }) {
	const { keyName } = use(params);
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const { workspaceId, prefix } = use(searchParams);
	const { data: result } = useSuspenseQuery(keyDetailQuery(keyName, workspaceId, prefix));
	if (result.kind === "notFound") notFound();
	if (result.kind === "conflict") return <p className="text-sm">{t("keyDetail.nameConflict")} <Link className="underline" href="/settings/keys">{t("keyDetail.openFromTable")}</Link></p>;
	if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	const data = result.data;
	if (!matchesKeyRouteName(data.key.name, keyName)) redirect({ href: keyDetailHref(data.key), locale });
	return <KeyDetailView data={data} />;
}

export default function Page(props: { params: Promise<{ keyName: string }>; searchParams: Promise<{ workspaceId?: string; prefix?: string }> }) {
	return <Suspense fallback={<SettingsSectionFallback />}><KeyDetailPage {...props} /></Suspense>;
}
