import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastSettingsContent from "./BroadcastContent";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export const metadata = {
	title: "Broadcast - Settings",
};

export default async function BroadcastSettingsPage() {
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						Broadcast
					</h1>
					<ProductFeedbackButton
						surface="settings_broadcast"
						prompt="Tell us what is missing or confusing about Broadcast destinations."
					/>
				</div>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}
