import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import RedeemCreditCodeCard from "@/components/(gateway)/credits/RedeemCreditCodeCard";

export const metadata: Metadata = {
	title: "Redeem Code",
};

type TeamOption = {
	id: string;
	name: string;
};

export default async function RedeemPage() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in?returnUrl=%2Fredeem");
	}

	const activeWorkspaceId = await getWorkspaceIdFromCookie();
	const teamOptions: TeamOption[] = [];
	const invoiceTeamIds = new Set<string>();

	try {
		const { data: rows, error: teamErr } = await supabase
			.from("workspace_members")
			.select("workspace_id, teams:workspaces(id, name, billing_mode)")
			.eq("user_id", user.id);

		if (teamErr) {
			console.log("[WARN] /redeem team fetch failed:", String(teamErr));
		} else {
			for (const row of rows ?? []) {
				const team = Array.isArray((row as any)?.teams)
					? (row as any).teams[0]
					: (row as any)?.teams;
				const id = String(team?.id ?? (row as any)?.workspace_id ?? "").trim();
				if (!id) continue;
				const name = String(team?.name ?? "Team").trim() || "Team";
				if (!teamOptions.some((entry) => entry.id === id)) {
					teamOptions.push({ id, name });
				}
				if (String(team?.billing_mode ?? "wallet").toLowerCase() === "invoice") {
					invoiceTeamIds.add(id);
				}
			}
		}
	} catch (err) {
		console.log("[WARN] /redeem unexpected team fetch error:", String(err));
	}

	if (activeWorkspaceId && !teamOptions.some((entry) => entry.id === activeWorkspaceId)) {
		teamOptions.unshift({ id: activeWorkspaceId, name: "Current Team" });
	}

	return (
		<div className="container mx-auto flex w-full flex-1 min-h-0 flex-col justify-center px-4 py-4 sm:py-6">
			<div className="mx-auto w-full max-w-2xl">
				<RedeemCreditCodeCard
					teams={teamOptions}
					invoiceTeamIds={Array.from(invoiceTeamIds)}
					defaultWorkspaceId={activeWorkspaceId ?? null}
					title="Redeem Promo Code"
					description="Enter your promo code below to receive credits."
					submitLabel="Redeem Code"
					showTeamSelector={teamOptions.length > 1}
					showDisclaimer
				/>
			</div>
		</div>
	);
}
