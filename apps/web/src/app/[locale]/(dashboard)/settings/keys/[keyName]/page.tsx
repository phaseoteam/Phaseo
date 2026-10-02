import { Suspense } from "react";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { KeyDetailView } from "@/components/(gateway)/settings/keys/KeyDetailView";
import { fetchSettingsKeyDetailByName, type KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";
import { WebApiError } from "@/lib/web-api/client";
import { keyDetailHref } from "@/components/(gateway)/settings/keys/keyDetailHref";
export const metadata = { title: "API key - Settings" };

async function KeyDetailPage({ params, searchParams }: { params: Promise<{ keyName: string }>; searchParams: Promise<{ workspaceId?: string; prefix?: string }> }) {
	const { keyName } = await params;
	const { workspaceId, prefix } = await searchParams;
	let data: KeyDetailData;
	try { data = await fetchSettingsKeyDetailByName(keyName, workspaceId, prefix); }
	catch (error) {
		if (error instanceof WebApiError && error.status === 404) notFound();
		if (error instanceof WebApiError && error.status === 409) return <p className="text-sm">Multiple keys share this name. <Link className="underline" href="/settings/keys">Open a key from the API keys table.</Link></p>;
		if (error instanceof WebApiError && error.status === 401) redirect({ href: "/sign-in", locale: await getLocale() });
		throw error;
	}
	if (data.key.name !== keyName) redirect({ href: keyDetailHref(data.key), locale: await getLocale() });
	return <KeyDetailView data={data} />;
}

export default function Page(props: { params: Promise<{ keyName: string }>; searchParams: Promise<{ workspaceId?: string; prefix?: string }> }) {
	return <Suspense fallback={<SettingsSectionFallback />}><KeyDetailPage {...props} /></Suspense>;
}
