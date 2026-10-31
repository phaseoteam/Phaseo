import { Suspense } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { Link, redirect } from "@/i18n/navigation";
import { getTranslations } from "@/i18n/server";
import { useLocale, useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound } from "@/lib/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { KeyDetailView } from "@/components/(gateway)/settings/keys/KeyDetailView";
import { keyDetailQuery } from "./keyDetail.functions";
import { keyDetailHref, matchesKeyRouteName } from "@/components/(gateway)/settings/keys/keyDetailHref";
export async function getKeyDetailMetadata() { const t = await getTranslations("SettingsUI.headers"); return { title: t("apiKeys") }; }

const ROUTE_ID = "/{-$locale}/_dashboard/settings/keys/$keyName/";

// The 404 / sign-in / canonical-name redirects also run in the route's beforeLoad.
function KeyDetailContent() {
	const { keyName } = useParams({ from: ROUTE_ID });
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const { workspaceId, prefix } = useSearch({ from: ROUTE_ID }) as { workspaceId?: string; prefix?: string };
	const { data: result } = useSuspenseQuery(keyDetailQuery(keyName, workspaceId, prefix));
	if (result.kind === "notFound") notFound();
	if (result.kind === "conflict") return <p className="text-sm">{t("keyDetail.nameConflict")} <Link className="underline" href="/settings/keys">{t("keyDetail.openFromTable")}</Link></p>;
	if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	const data = result.data;
	if (!matchesKeyRouteName(data.key.name, keyName)) redirect({ href: keyDetailHref(data.key), locale });
	return <KeyDetailView data={data} />;
}

export default function KeyDetailPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><KeyDetailContent /></Suspense>;
}
