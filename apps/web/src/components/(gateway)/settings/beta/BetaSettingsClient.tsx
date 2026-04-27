"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateBetaPreferences } from "@/app/(dashboard)/settings/beta/actions";
import {
	dispatchStoredBetaProfileChanged,
	writeStoredBetaProfile,
	type StatsigProfile,
} from "@/lib/statsig/shared";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type BetaFeatureDefinition = {
	key: string;
	kind?: "toggle" | "range";
	title: string;
	description: string;
};

export default function BetaSettingsClient({
	initialProfile,
	features,
}: {
	initialProfile: StatsigProfile;
	features: readonly BetaFeatureDefinition[];
}) {
	const router = useRouter();
	const [betaFeatures, setBetaFeatures] = React.useState(initialProfile.betaFeatures);
	const [savingKey, setSavingKey] = React.useState<string | null>(null);

	React.useEffect(() => {
		setBetaFeatures(initialProfile.betaFeatures);
	}, [initialProfile]);

	const persistFeatures = React.useCallback(
		async (nextBetaFeatures: Record<string, boolean>) => {
			const savePromise = updateBetaPreferences({
				beta_features: nextBetaFeatures,
			});

			await toast.promise(savePromise, {
				loading: "Saving beta preferences...",
				success: "Beta preferences updated",
				error: (error: unknown) =>
					error instanceof Error
						? error.message
						: "Could not save beta preferences",
			});

			const result = await savePromise;
			writeStoredBetaProfile(result.profile);
			dispatchStoredBetaProfileChanged(result.profile);
			router.refresh();
		},
		[router]
	);

	const toggleFeature = React.useCallback(
		async (featureKey: string, enabled: boolean) => {
			if (savingKey) return;

			const previous = betaFeatures;
			const next = { ...previous };
			if (enabled) {
				next[featureKey] = true;
			} else {
				delete next[featureKey];
			}

			setBetaFeatures(next);
			setSavingKey(featureKey);

			try {
				await persistFeatures(next);
			} catch {
				setBetaFeatures(previous);
			} finally {
				setSavingKey(null);
			}
		},
		[betaFeatures, persistFeatures, savingKey]
	);

	return (
		<div className="overflow-hidden rounded-2xl border border-border/60 bg-background">
			{features.map((feature, index) => {
				const enabled = betaFeatures[feature.key] === true;
				const isSaving = savingKey === feature.key;
				const showBorder = index < features.length - 1;

				return (
					<div
						key={feature.key}
						className={[
							"flex items-start justify-between gap-4 px-4 py-4 sm:px-5",
							showBorder ? "border-b border-border/60" : "",
						].join(" ")}
					>
						<div className="min-w-0 pr-4">
							<div className="flex flex-wrap items-center gap-2">
								<p className="text-sm font-medium">{feature.title}</p>
								{feature.kind && feature.kind !== "toggle" ? (
									<Badge variant="outline" className="text-[10px] uppercase">
										{feature.kind}
									</Badge>
								) : null}
								{isSaving ? (
									<Badge variant="secondary" className="text-[10px]">
										Saving
									</Badge>
								) : null}
							</div>
							<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
								{feature.description}
							</p>
						</div>
						<Switch
							checked={enabled}
							disabled={savingKey !== null}
							onCheckedChange={(next) => void toggleFeature(feature.key, next)}
						/>
					</div>
				);
			})}
		</div>
	);
}
