import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppWindow, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import OAuthAppDetailPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppDetailPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
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
import { fetchSettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/fetchSettingsOAuthAppDetailInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("oauthAppDetails") };
}

interface OAuthAppDetailPageProps {
	params: Promise<{
		clientId: string;
	}>;
}

export default async function OAuthAppDetailPage({ params }: OAuthAppDetailPageProps) {
	const thirdPartyOAuthEnabled = isThirdPartyOAuthEnabled();
	const t = await getTranslations("SettingsUI");

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/settings/oauth-apps">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div className="flex-1">
					<h1 className="text-2xl font-bold">{t("headers.oauthApplication")}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{t("headers.oauthApplicationDetails")}
					</p>
				</div>
			</div>
			{thirdPartyOAuthEnabled ? (
				<Suspense fallback={<SettingsSectionFallback />}>
					<OAuthAppDetailContent params={params} />
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

async function OAuthAppDetailContent({ params }: OAuthAppDetailPageProps) {
	const { clientId } = await params;
	const initialData = await fetchSettingsOAuthAppDetailInitialData(clientId);

	if (!initialData.signedIn || !initialData.currentUserId) {
		return notFound();
	}

	if (!initialData.oauthApp) {
		return notFound();
	}

	return (
		<OAuthAppDetailPanel
			oauthApp={initialData.oauthApp}
			authorizations={initialData.authorizations}
			usageStats={initialData.usageStats}
			recentRequests={initialData.recentRequests}
			userDirectory={initialData.userDirectory}
			currentUserId={initialData.currentUserId}
		/>
	);
}
