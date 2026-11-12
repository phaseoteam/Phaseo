import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import Link from "@/components/link";
import { AppWindow, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import OAuthAppDetailContent from "./OAuthAppDetailContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	isThirdPartyOAuthEnabled,
} from "@/lib/oauth/thirdPartyOAuth";
import { getTranslations } from "@/i18n/server";

export async function getOauthAppMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("oauthAppDetails") };
}

export default function OAuthAppDetailPage() {
	const thirdPartyOAuthEnabled = isThirdPartyOAuthEnabled();
	const t = useTranslations("SettingsUI");

	return (
		<div className="w-full max-w-4xl space-y-8">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/settings/oauth-apps">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<SettingsPageHeader title={t("headers.oauthApplication")} description={t("headers.oauthApplicationDetails")} />
			</div>
			{thirdPartyOAuthEnabled ? (
				<Suspense fallback={<SettingsSectionFallback />}>
					<OAuthAppDetailLoader />
				</Suspense>
			) : (
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AppWindow className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>{t("headers.oauthComingSoon")}</EmptyTitle>
						<EmptyDescription>
							{t("headers.oauthDisabled")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function OAuthAppDetailLoader() {
	const { clientId } = useParams({ from: "/{-$locale}/_dashboard/settings/oauth-apps/$clientId/" });
	return <OAuthAppDetailContent clientId={clientId} />;
}
