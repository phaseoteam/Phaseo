import { Suspense, use } from "react";
import { notFound } from "@/lib/navigation";
import { getTranslations } from "@/i18n/server";
import { useLocale } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { redirect } from "@/i18n/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { WorkspaceUserView } from "@/components/(gateway)/settings/workspaces/WorkspaceUserView";
import { workspaceUserQuery } from "./workspaceUser.functions";

type Props = { params: Promise<{ userId: string }>; searchParams: Promise<{ workspaceId?: string; keyPage?: string }> };
export async function generateMetadata() { const t = await getTranslations("SettingsUI.workspaceUser"); return { title: t("profile") }; }

// The /settings/profile, 404 and sign-in redirects also run in the route's beforeLoad.
function UserPage({ params, searchParams }: Props) {
	const { userId } = use(params);
	const { workspaceId, keyPage } = use(searchParams);
	const locale = useLocale();
	const { data: result } = useSuspenseQuery(workspaceUserQuery(userId, workspaceId, keyPage));
	if (result.kind === "self") redirect({ href: "/settings/profile", locale });
	if (result.kind === "notFound") notFound();
	if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	return <WorkspaceUserView data={result.data} />;
}

export default function Page(props: Props) { return <Suspense fallback={<SettingsSectionFallback />}><UserPage {...props} /></Suspense>; }
