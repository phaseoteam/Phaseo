import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { buildMetadata } from "@/lib/seo";
import {
	formatSupportWait,
	getSupportAvailability,
	getLondonInfo,
} from "@/lib/support/schedule";
import { ContactClient } from "@/components/contact/ContactClient";
import { fetchContactPersonalization } from "@/lib/fetchers/internal/fetchContactPersonalization";

export const metadata: Metadata = buildMetadata({
	title: "Contact AI Stats Support",
	description:
		"Contact AI Stats support for account, billing, and product questions, with direct human responses from the founder plus docs, community resources, and current support availability.",
	path: "/contact",
	keywords: [
		"AI Stats support",
		"contact AI Stats",
		"AI gateway support",
		"AI model database help",
	],
});

async function ContactPersonalization() {
	await connection();

	const { isOpen, minutesUntilNextWindow } = getSupportAvailability();
	const { label: londonLabel } = getLondonInfo();
	const backOnlineLabel = formatSupportWait(minutesUntilNextWindow);
	const statusLabel = isOpen
		? "Available now"
		: backOnlineLabel
			? `Back in ${backOnlineLabel}`
			: "Outside hours";
	const statusTone = isOpen
		? "bg-emerald-500 ring-emerald-400/60"
		: "bg-amber-500 ring-amber-400/60";
	const waitText = isOpen
		? "I'm available right now. Expect a direct human reply within 30 minutes."
		: backOnlineLabel
			? `Support will be back online in ${backOnlineLabel}. Replies may be delayed, but you will still get a direct human response from me as soon as possible.`
			: "I'm away right now. Replies may be delayed, but you will still get a direct human response from me as soon as possible.";
	const personalization = await fetchContactPersonalization().catch(() => ({
		defaultInternalId: "",
		tierLabel: "",
		userEmail: null,
	}));

	return (
		<ContactClient
			isOpen={isOpen}
			statusLabel={statusLabel}
			statusTone={statusTone}
			waitText={waitText}
			londonLabel={londonLabel}
			userEmail={personalization.userEmail}
			tierLabel={personalization.tierLabel}
			defaultInternalId={personalization.defaultInternalId}
		/>
	);
}

export default function ContactPage() {
	return (
		<Suspense
			fallback={
				<ContactClient
					isOpen={false}
					statusLabel="Checking availability"
					statusTone="bg-amber-500 ring-amber-400/60"
					waitText="Loading current support hours..."
					londonLabel=""
					userEmail={null}
					tierLabel=""
					defaultInternalId=""
				/>
			}
		>
			<ContactPersonalization />
		</Suspense>
	);
}
