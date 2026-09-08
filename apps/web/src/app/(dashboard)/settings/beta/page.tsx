import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BetaSettingsClient from "@/components/(gateway)/settings/beta/BetaSettingsClient";
import {
	WEB_BETA_FEATURES,
	type WebBetaFeatureDefinition,
} from "@/lib/statsig/shared";
import { fetchSettingsBetaInitialData } from "@/lib/fetchers/internal/fetchSettingsBetaInitialData";
import Link from "next/link";
import { batchApiFlag, videoApiFlag } from "@/lib/flags";

export default async function BetaSettingsPage() {
	const initialData = await fetchSettingsBetaInitialData();
	const [videoEnabled, batchEnabled] = initialData.signedIn
		? await Promise.all([videoApiFlag().catch(() => false), batchApiFlag().catch(() => false)])
		: [false, false];
	const betaFeatures: readonly WebBetaFeatureDefinition[] = WEB_BETA_FEATURES.filter(
		(feature) =>
			(feature as WebBetaFeatureDefinition).selfService !== false &&
			(!feature.adminOnly || initialData.isAdmin),
	);

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Feature Preview"
					description="Early access to new gateway and web features."
					meta={<Badge variant="outline">Beta</Badge>}
				/>
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					Not signed in.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Feature Preview"
				description="Early access to new gateway and web features."
				meta={<Badge variant="outline">Beta</Badge>}
			/>
			<div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
				{[
					{ title: "Video API", enabled: videoEnabled, kind: "video", description: "Generate videos with provider routing, job tracking and signed webhook updates." },
					{ title: "Batch API", enabled: batchEnabled, kind: "batch", description: "Submit asynchronous batches, retrieve results and receive signed webhook updates." },
				].map((feature) => (
					<div key={feature.kind} className="space-y-2 px-4 py-4 sm:px-5">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-medium">{feature.title}</h2>
							<Badge variant="outline">Beta</Badge>
							<Badge variant="secondary">{feature.enabled ? "Available" : "Invite only"}</Badge>
						</div>
						<p className="text-sm text-muted-foreground">{feature.description}</p>
						<p className="text-sm text-muted-foreground">Access is granted to selected workspaces. Normal usage charges apply.</p>
						<div className="flex gap-4 text-sm">
							<a className="underline underline-offset-4" href="https://phaseo.app/docs/v1/guides/async-video-and-batch">Read the beta guide</a>
							{feature.enabled ? <Link className="underline underline-offset-4" href={`/settings/usage/logs/${feature.kind === "video" ? "videos" : "batches"}`}>View jobs</Link> : null}
						</div>
					</div>
				))}
			</div>
			{betaFeatures.length === 0 ? (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					There are currently no additional features to opt into.
				</div>
			) : (
				<BetaSettingsClient
					initialProfile={initialData.profile}
					features={betaFeatures}
				/>
			)}
		</div>
	);
}
