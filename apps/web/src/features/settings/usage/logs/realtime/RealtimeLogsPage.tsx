import { Suspense } from "react";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { privateUsageScopeQuery } from "../../usage.functions";
import RealtimeSessionsClient from "./RealtimeSessionsClient";

export async function getRealtimeLogsMetadata() { const t = await getTranslations("SettingsUI"); return { title: `${t("realtimeCopy.realtimeSessions")} - ${t("headers.settings")}` }; }

function SessionList() {
	const { data: scope } = useSuspenseQuery(privateUsageScopeQuery());
	return <RealtimeSessionsClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} />;
}

export default function RealtimeLogsPage() {
	const t = useTranslations("SettingsUI");
	return <div className="min-w-0 space-y-4"><div><h1 className="text-2xl font-semibold tracking-tight">{t("realtimeCopy.realtimeSessions")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("realtimeCopy.sessionsHelp")}</p></div><Suspense fallback={<div role="status" className="rounded-lg border p-8 text-sm text-muted-foreground">{t("realtimeCopy.loadingSessions")}</div>}><SessionList /></Suspense></div>;
}
