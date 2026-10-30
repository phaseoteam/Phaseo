"use client";

import { notFound } from "next/navigation";
import OAuthAppDetailPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppDetailPanel";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default function OAuthAppDetailContent({ clientId }: { clientId: string }) {
	return <PrivateSettingsQuery<SettingsOAuthAppDetailInitialData>
		path={`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`}
		resource="oauth-app" parameters={clientId}
	>{(data) => {
		if (!data.oauthApp || !data.currentUserId) notFound();
		return <OAuthAppDetailPanel key={clientId} {...data} currentUserId={data.currentUserId} />;
	}}</PrivateSettingsQuery>;
}
