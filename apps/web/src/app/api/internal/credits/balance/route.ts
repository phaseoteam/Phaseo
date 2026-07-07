import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type CreditsBalanceData = {
	initialBalance: number | null;
};

function nanosToCredits(value: unknown): number | null {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : null;
}

export async function GET() {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({ initialBalance: null } satisfies CreditsBalanceData);
	}

	try {
		const { data, error } = await readClient
			.from("wallets")
			.select("balance_nanos")
			.eq("workspace_id", workspaceId)
			.maybeSingle();

		if (!error && data) {
			return NextResponse.json({
				initialBalance: nanosToCredits(data.balance_nanos),
			} satisfies CreditsBalanceData);
		}
	} catch (error) {
		void error;
	}

	try {
		const { data, error } = await readClient
			.from("credit_ledger")
			.select("after_balance_nanos,event_time")
			.eq("workspace_id", workspaceId)
			.order("event_time", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (!error && data) {
			return NextResponse.json({
				initialBalance: nanosToCredits(data.after_balance_nanos),
			} satisfies CreditsBalanceData);
		}
	} catch (error) {
		void error;
	}

	return NextResponse.json({ initialBalance: null } satisfies CreditsBalanceData);
}
