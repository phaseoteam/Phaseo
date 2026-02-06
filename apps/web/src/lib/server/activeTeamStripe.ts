import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

type ActiveTeamStripeCustomer = {
    teamId: string;
    customerId: string;
    userId: string;
};

export async function requireActiveTeamStripeCustomer(): Promise<ActiveTeamStripeCustomer> {
    const supabase = await createClient();
    const {
        data: { user },
        error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
        throw new Error("unauthorized");
    }

    const teamId = await getTeamIdFromCookie();
    if (!teamId) {
        throw new Error("missing_team");
    }

    const { data: wallet, error: walletErr } = await supabase
        .from("wallets")
        .select("team_id, stripe_customer_id")
        .eq("team_id", teamId)
        .maybeSingle();

    if (walletErr) throw walletErr;
    if (!wallet?.stripe_customer_id) {
        throw new Error("missing_stripe_customer");
    }

    return {
        teamId: String(wallet.team_id),
        customerId: String(wallet.stripe_customer_id),
        userId: user.id,
    };
}
