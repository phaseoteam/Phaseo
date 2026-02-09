import TierOverview from "@/components/(gateway)/credits/TierOverview";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { Metadata } from "next";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata: Metadata = {
	title: "Pricing & Tiers - Settings",
};

export default function Page() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Pricing & Tiers</h1>
				<p className="text-sm text-muted-foreground mt-1">
					View your current pricing tier and track your savings
				</p>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<TierOverviewContent />
			</Suspense>
		</div>
	);
}

async function TierOverviewContent() {
	const teamId = await getTeamIdFromCookie();
	return <TierOverview teamId={teamId} />;
}
