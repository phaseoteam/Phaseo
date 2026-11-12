import { Suspense } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
import { getTranslations } from "@/i18n/server";
import { useLocale } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { redirect } from "@/i18n/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { WorkspaceUserView } from "@/components/(gateway)/settings/workspaces/WorkspaceUserView";
import { workspaceUserQuery } from "./workspaceUser.functions";

const ROUTE_ID = "/{-$locale}/_dashboard/settings/workspaces/users/$userId/";
export async function getWorkspaceUserMetadata() { const t = await getTranslations("SettingsUI.workspaceUser"); return { title: t("profile") }; }

// The /settings/profile, 404 and sign-in redirects also run in the route's beforeLoad.
function UserPage() {
	const { userId } = useParams({ from: ROUTE_ID });
	const { workspaceId, keyPage } = useSearch({ from: ROUTE_ID }) as { workspaceId?: string; keyPage?: string };
	const locale = useLocale();
	const { data: result } = useSuspenseQuery(workspaceUserQuery(userId, workspaceId, keyPage));
	if (result.kind === "self") redirect({ href: "/settings/profile", locale });
	if (result.kind === "notFound") notFound();
	if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	return <WorkspaceUserView data={result.data} />;
}

export default function WorkspaceUserPage() { return <Suspense fallback={<SettingsSectionFallback />}><UserPage /></Suspense>; }
