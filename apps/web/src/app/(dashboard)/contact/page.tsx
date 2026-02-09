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
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

export const metadata: Metadata = buildMetadata({
	title: "Contact AI Stats Support",
	description:
		"Reach AI Stats support, community, and documentation links for account, billing, and product questions.",
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
	const { date } = getLondonInfo();
	const statusLabel = isOpen ? "Available now" : "Outside hours";
	const statusTone = isOpen
		? "bg-emerald-500 ring-emerald-400/60"
		: "bg-amber-500 ring-amber-400/60";
	const waitText = isOpen
		? "I'm available right now. Expect a reply within 30 minutes."
		: minutesUntilNextWindow
			? `I'm away. Next window opens in ${formatSupportWait(
					minutesUntilNextWindow
				)}. Replies may be delayed - please be patient and I'll get back to you ASAP.`
			: "I'm away right now. Replies may be delayed - please be patient and I'll get back to you ASAP.";
	const londonLabel = date.toLocaleString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "short",
		weekday: "short",
	});

	const teamId = await getTeamIdFromCookie();
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	let tierLabel = "";
	let defaultInternalId = "";
	if (teamId) {
		try {
			const [{ data: prev }, { data: teamResult }] = await Promise.all([
				supabase.rpc("monthly_spend_prev_cents", { p_team: teamId }).single(),
				supabase.from("teams").select("slug").eq("id", teamId).single(),
			]);
			const lastMonthCents = Number(prev ?? 0);
			const lastMonthUsd = lastMonthCents / 1_000_000_000;
			tierLabel = lastMonthUsd >= 10000 ? "Enterprise" : "Basic";
			defaultInternalId = teamResult?.slug ?? teamId ?? "";
		} catch (error) {
			console.warn("[contact] failed to load tier label", error);
		}
	}

	return (
		<ContactClient
			isOpen={isOpen}
			statusLabel={statusLabel}
			statusTone={statusTone}
			waitText={waitText}
			londonLabel={londonLabel}
			userEmail={user?.email ?? null}
			tierLabel={tierLabel}
			defaultInternalId={defaultInternalId}
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
