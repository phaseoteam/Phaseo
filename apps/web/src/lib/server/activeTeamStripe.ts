import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { getStripe } from "@/lib/stripe";

type ActiveTeamStripeCustomer = {
    teamId: string;
    customerId: string;
    userId: string;
};

type RequireActiveTeamStripeCustomerOptions = {
    createIfMissing?: boolean;
};

function deriveCustomerName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string | undefined {
    const meta = user.user_metadata ?? {};
    const fromMeta =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        null;
    if (fromMeta) return fromMeta;
    const emailLocal = user.email?.split("@")[0]?.trim();
    return emailLocal || undefined;
}

async function findOrCreateStripeCustomer(args: {
    teamId: string;
    userId: string;
    email?: string | null;
    name?: string;
}): Promise<string> {
    const stripe = getStripe();
    let customerId: string | null = null;

    try {
        const search = await stripe.customers.search({
            query: `metadata['team_id']:'${args.teamId}'`,
            limit: 1,
        });
        if (search.data.length > 0) {
            customerId = search.data[0].id;
        }
    } catch {
        // Ignore search failures and fallback to create path.
    }

    if (!customerId && args.email) {
        const list = await stripe.customers.list({ email: args.email, limit: 1 });
        if (list.data.length > 0) {
            customerId = list.data[0].id;
            try {
                await stripe.customers.update(customerId, {
                    metadata: { team_id: args.teamId, user_id: args.userId },
                });
            } catch {
                // Best-effort metadata patch only.
            }
        }
    }

    if (!customerId) {
        const created = await stripe.customers.create({
            email: args.email ?? undefined,
            name: args.name,
            metadata: { team_id: args.teamId, user_id: args.userId },
        });
        customerId = created.id;
    }

    return customerId;
}

export async function requireActiveTeamStripeCustomer(
    options: RequireActiveTeamStripeCustomerOptions = {}
): Promise<ActiveTeamStripeCustomer> {
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
    if (!wallet?.stripe_customer_id && !options.createIfMissing) {
        throw new Error("missing_stripe_customer");
    }

    if (!wallet?.stripe_customer_id && options.createIfMissing) {
        const customerId = await findOrCreateStripeCustomer({
            teamId,
            userId: user.id,
            email: user.email ?? undefined,
            name: deriveCustomerName(user),
        });

        const admin = createAdminClient();
        const { error: upsertError } = await admin
            .from("wallets")
            .upsert(
                { team_id: teamId, stripe_customer_id: customerId },
                { onConflict: "team_id", ignoreDuplicates: false }
            );

        if (upsertError) throw upsertError;

        return {
            teamId,
            customerId,
            userId: user.id,
        };
    }

    if (!wallet?.team_id || !wallet?.stripe_customer_id) {
        throw new Error("missing_stripe_customer");
    }

    return {
        teamId: String(wallet.team_id),
        customerId: String(wallet.stripe_customer_id),
        userId: user.id,
    };
}
