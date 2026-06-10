import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { requireWorkspaceMembership } from "@/utils/serverActionAuth";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

type ActiveTeamStripeCustomer = {
    workspaceId: string;
    customerId: string;
    userId: string;
    userEmail: string | null;
    userDisplayName: string | null;
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

function isMissingStripeCustomerError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const candidate = error as {
        code?: string;
        param?: string;
        message?: string;
        raw?: { code?: string; param?: string; message?: string };
    };

    const code = String(candidate.code ?? candidate.raw?.code ?? "");
    const param = String(candidate.param ?? candidate.raw?.param ?? "");
    const message = String(candidate.message ?? candidate.raw?.message ?? "");

    return (
        code === "resource_missing" &&
        (param === "customer" || param === "id" || message.includes("No such customer"))
    );
}

async function upsertWorkspaceStripeCustomer(workspaceId: string, customerId: string) {
    const admin = createAdminClient();
    const { error: upsertError } = await admin
        .from("wallets")
        .upsert(
            { workspace_id: workspaceId, stripe_customer_id: customerId },
            { onConflict: "workspace_id", ignoreDuplicates: false }
        );

    if (upsertError) throw upsertError;
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

async function resolveWorkspaceStripeCustomer(args: {
    workspaceId: string;
    userId: string;
    email?: string | null;
    name?: string;
    storedCustomerId?: string | null;
    createIfMissing?: boolean;
}): Promise<string | null> {
    const storedCustomerId = args.storedCustomerId?.trim() ?? "";
    const stripe = getStripe();

    if (storedCustomerId) {
        try {
            const customer = await stripe.customers.retrieve(storedCustomerId);
            if ("deleted" in customer && customer.deleted) {
                console.warn("[stripe-customer] Stored customer is deleted; repairing binding", {
                    workspaceId: args.workspaceId,
                    customerId: storedCustomerId,
                });
            } else {
                const boundWorkspaceId =
                    typeof customer.metadata?.workspace_id === "string"
                        ? customer.metadata.workspace_id.trim()
                        : "";

                if (!boundWorkspaceId || boundWorkspaceId === args.workspaceId) {
                    return storedCustomerId;
                }

                console.warn("[stripe-customer] Stored customer belongs to another workspace; repairing binding", {
                    workspaceId: args.workspaceId,
                    customerId: storedCustomerId,
                    boundWorkspaceId,
                });
            }
        } catch (error) {
            if (!isMissingStripeCustomerError(error)) {
                throw error;
            }

            console.warn("[stripe-customer] Stored customer missing in current Stripe account; repairing binding", {
                workspaceId: args.workspaceId,
                customerId: storedCustomerId,
            });
        }
    } else if (!args.createIfMissing) {
        return null;
    }

    const customerId = await findOrCreateStripeCustomer({
        workspaceId: args.workspaceId,
        userId: args.userId,
        email: args.email ?? undefined,
        name: args.name,
    });

    if (customerId !== storedCustomerId) {
        await upsertWorkspaceStripeCustomer(args.workspaceId, customerId);
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
    const customerId = await resolveWorkspaceStripeCustomer({
        workspaceId,
        userId: user.id,
        email: user.email ?? undefined,
        name: deriveCustomerName(user),
        storedCustomerId: wallet?.stripe_customer_id ?? null,
        createIfMissing: options.createIfMissing ?? false,
    });

    if (!wallet?.workspace_id || !customerId) {
        throw new Error("missing_stripe_customer");
    }

    return {
        workspaceId: String(wallet.workspace_id),
        customerId,
        userId: user.id,
        userEmail: user.email ?? null,
        userDisplayName: deriveCustomerName(user) ?? null,
    };
}

export async function ensureWorkspaceStripeWallet(args?: {
    workspaceId?: string;
    userId?: string;
    email?: string | null;
    name?: string;
}) {
    if (args?.workspaceId && args?.userId) {
        const customerId = await resolveWorkspaceStripeCustomer({
            workspaceId: args.workspaceId,
            userId: args.userId,
            email: args.email ?? undefined,
            name: args.name,
            createIfMissing: true,
        });
        if (!customerId) {
            throw new Error("missing_stripe_customer");
        }

        return {
            workspaceId: args.workspaceId,
            customerId,
            userId: args.userId,
        };
    }

    return requireActiveTeamStripeCustomer({ createIfMissing: true });
}

export const requireActiveWorkspaceStripeCustomer = requireActiveTeamStripeCustomer;
