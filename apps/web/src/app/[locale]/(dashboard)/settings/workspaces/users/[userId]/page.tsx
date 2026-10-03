import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { WorkspaceUserView } from "@/components/(gateway)/settings/workspaces/WorkspaceUserView";
import { fetchWorkspaceUser, type WorkspaceUserData } from "@/lib/fetchers/internal/fetchWorkspaceUser";
import { WebApiError } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

type Props = { params: Promise<{ userId: string }>; searchParams: Promise<{ workspaceId?: string; keyPage?: string }> };
export async function generateMetadata() { const t = await getTranslations("SettingsUI.workspaceUser"); return { title: t("profile") }; }

async function UserPage({ params, searchParams }: Props) {
	const [{ userId }, { workspaceId, keyPage }] = await Promise.all([params, searchParams]);
	const { userId: viewerId } = await getServerAccountContext();
	if (viewerId === userId) redirect({ href: "/settings/profile", locale: await getLocale() });
	if (!workspaceId) notFound();
	let data: WorkspaceUserData;
	try {
		data = await fetchWorkspaceUser(userId, workspaceId, keyPage);
	} catch (error) {
		if (error instanceof WebApiError && [400, 403, 404].includes(error.status)) notFound();
		if (error instanceof WebApiError && error.status === 401) redirect({ href: "/sign-in", locale: await getLocale() });
		throw error;
	}
	return <WorkspaceUserView data={data} />;
}

export default function Page(props: Props) { return <Suspense fallback={<SettingsSectionFallback />}><UserPage {...props} /></Suspense>; }
