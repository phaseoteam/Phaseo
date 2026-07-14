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
	THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE,
	isThirdPartyOAuthEnabled,
} from "@/lib/oauth/thirdPartyOAuth";
import { fetchSettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/fetchSettingsOAuthAppDetailInitialData";

export const metadata = {
	title: "OAuth App Details - Settings",
};

interface OAuthAppDetailPageProps {
	params: Promise<{
		clientId: string;
	}>;
}

export default function OAuthAppDetailPage({ params }: OAuthAppDetailPageProps) {
	const thirdPartyOAuthEnabled = isThirdPartyOAuthEnabled();

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/settings/oauth-apps">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div className="flex-1">
					<h1 className="text-2xl font-bold">OAuth Application</h1>
					<p className="text-sm text-muted-foreground mt-1">
						OAuth Application Details
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
						<EmptyTitle>OAuth apps are coming soon</EmptyTitle>
						<EmptyDescription>
							{THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE}
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
