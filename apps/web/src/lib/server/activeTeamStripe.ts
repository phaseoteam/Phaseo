import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { requireWorkspaceMembership } from "@/utils/serverActionAuth";
import { getStripe } from "@/lib/stripe";

type ActiveTeamStripeCustomer = {
    workspaceId: string;
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
    workspaceId: string;
    userId: string;
    email?: string | null;
    name?: string;
}): Promise<string> {
    const stripe = getStripe();
    let customerId: string | null = null;

    try {
        const search = await stripe.customers.search({
            query: `metadata['workspace_id']:'${args.workspaceId}'`,
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
                    metadata: { workspace_id: args.workspaceId, user_id: args.userId },
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
            metadata: { workspace_id: args.workspaceId, user_id: args.userId },
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

    const workspaceId = await getWorkspaceIdFromCookie();
    if (!workspaceId) {
        throw new Error("missing_team");
    }

    try {
        await requireWorkspaceMembership(supabase, user.id, workspaceId);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.toLowerCase() === "unauthorized"
        ) {
            throw new Error("unauthorized");
        }
        throw error;
    }

    const { data: wallet, error: walletErr } = await supabase
        .from("wallets")
        .select("workspace_id, stripe_customer_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

    if (walletErr) throw walletErr;
    if (!wallet?.stripe_customer_id && !options.createIfMissing) {
        throw new Error("missing_stripe_customer");
    }

    if (!wallet?.stripe_customer_id && options.createIfMissing) {
        const customerId = await findOrCreateStripeCustomer({
            workspaceId,
            userId: user.id,
            email: user.email ?? undefined,
            name: deriveCustomerName(user),
        });

        const admin = createAdminClient();
        const { error: upsertError } = await admin
            .from("wallets")
            .upsert(
                { workspace_id: workspaceId, stripe_customer_id: customerId },
                { onConflict: "workspace_id", ignoreDuplicates: false }
            );

        if (upsertError) throw upsertError;

        return {
            workspaceId,
            customerId,
            userId: user.id,
        };
    }

    if (!wallet?.workspace_id || !wallet?.stripe_customer_id) {
        throw new Error("missing_stripe_customer");
    }

    return {
        workspaceId: String(wallet.workspace_id),
        customerId: String(wallet.stripe_customer_id),
        userId: user.id,
    };
}

export async function ensureWorkspaceStripeWallet(args?: {
    workspaceId?: string;
    userId?: string;
    email?: string | null;
    name?: string;
}) {
    if (args?.workspaceId && args?.userId) {
        const customerId = await findOrCreateStripeCustomer({
            workspaceId: args.workspaceId,
            userId: args.userId,
            email: args.email ?? undefined,
            name: args.name,
        });

        const admin = createAdminClient();
        const { error } = await admin
            .from("wallets")
            .upsert(
                { workspace_id: args.workspaceId, stripe_customer_id: customerId },
                { onConflict: "workspace_id", ignoreDuplicates: false }
            );
        if (error) throw error;

        return {
            workspaceId: args.workspaceId,
            customerId,
            userId: args.userId,
        };
    }

    return requireActiveTeamStripeCustomer({ createIfMissing: true });
}
