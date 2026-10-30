type UpsertInput = {
    externalId: string;
    name: string;
    tierId: string;
};

export default async function upsertLinearCustomer(input: UpsertInput) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        console.error("[LINEAR] Missing LINEAR_API_KEY env var");
        return null;
    }

    const ownerId = process.env.LINEAR_DEFAULT_ASSIGNED_USER_ID;
    if (!ownerId || ownerId.trim() === "") {
        console.error("[LINEAR] Missing LINEAR_DEFAULT_ASSIGNED_USER_ID env var");
        return null;
    }

    // Queries / mutations
    const UPSERT_MUT = `
        mutation CustomerUpsert($input: CustomerUpsertInput!) {
            customerUpsert(input: $input) {
                success
                customer {
                    id
                    name
                    externalIds
                    owner { id name }
                }
            }
        }
    `;

    // Prepare a definite string API key + headers so TS is happy
    let rawKey = apiKey;
    if (rawKey.startsWith("Bearer ")) {
        console.info('[LINEAR] Stripping "Bearer " prefix from LINEAR_API_KEY');
        rawKey = rawKey.replace(/^Bearer\s+/i, "");
    }

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: rawKey,
    };

    async function gql<T>(query: string, variables?: Record<string, unknown>) {
        const res = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers,
            body: JSON.stringify({ query, variables }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "<could not read body>");
            console.error("[LINEAR] GraphQL request failed", {
                status: res.status,
                statusText: res.statusText,
                body: text,
            });
            return null as T | null;
        }
        const json = (await res.json().catch(() => null)) as
            | { data?: T; errors?: unknown }
            | null;
        if (!json) return null;
        if ((json as any).errors) {
            console.error("[LINEAR] graphql errors", (json as any).errors);
        }
        return (json.data ?? null) as T | null;
    }

    try {
        console.debug("[LINEAR] upsertLinearCustomer request", {
            externalId: input.externalId,
            name: input.name,
            ownerId,
            tierId: input.tierId,
        });

        const upsertInput = {
            externalId: input.externalId,
            name: input.name,
            tierId: input.tierId ?? undefined,
            ownerId, // <- assign from env
        };

        const data = await gql<{
            customerUpsert: {
                success: boolean;
                customer?: {
                    id: string;
                    name: string;
                    externalIds?: string[];
                    owner?: { id: string; name?: string | null } | null;
                } | null;
            };
        }>(UPSERT_MUT, { input: upsertInput });

        const payload = data?.customerUpsert;
        if (payload?.success && payload.customer?.id) {
            console.info("[LINEAR] upsert successful", {
                id: payload.customer.id,
                ownerId,
            });
            return { id: payload.customer.id, customer: payload.customer };
        }

        console.warn("[LINEAR] upsert did not return success", { data });
        return null;
    } catch (err) {
        console.error("[LINEAR] upsertLinearCustomer unexpected error", err, {
            externalId: input.externalId,
            name: input.name,
            ownerId,
        });
        return null;
    }
}