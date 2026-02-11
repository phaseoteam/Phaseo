// Purpose: Key control-plane routes for cache invalidation.
// Why: KV versioning needs a mutation hook when keys are revoked/disabled.
// How: Bumps per-key KV versions so versioned cache keys miss globally.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin, getCache, getBindings } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { setKeyVersion } from "@/core/kv";

function timingSafeEqual(a: string, b: string): boolean {
    const len = Math.max(a.length, b.length);
    let diff = a.length === b.length ? 0 : 1;
    for (let i = 0; i < len; i++) {
        const ca = i < a.length ? a.charCodeAt(i) : 0;
        const cb = i < b.length ? b.charCodeAt(i) : 0;
        diff |= ca ^ cb;
    }
    return diff === 0;
}

async function handleInvalidateKey(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }
    const { teamId } = auth.value;

    const bindings = getBindings();
    const controlSecret = bindings.GATEWAY_CONTROL_SECRET?.trim();
    if (!controlSecret) {
        return json(
            { ok: false, error: "control_secret_missing", message: "GATEWAY_CONTROL_SECRET is not configured" },
            503,
            { "Cache-Control": "no-store" },
        );
    }
    const providedSecret = req.headers.get("x-control-secret")?.trim() ?? "";
    if (!timingSafeEqual(providedSecret, controlSecret)) {
        return json(
            { ok: false, error: "forbidden", message: "Invalid control secret" },
            403,
            { "Cache-Control": "no-store" },
        );
    }

    const url = new URL(req.url);
    const keyId = url.pathname.split("/").slice(-2, -1)[0];

    if (!keyId) {
        return json({ ok: false, error: "key ID is required" }, 400);
    }

    try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from("keys")
            .select("id, kid, status, team_id")
            .eq("id", keyId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message || "Failed to fetch key");
        }

        if (!data) {
            return json({ ok: false, error: "Key not found" }, 404);
        }

        if (data.team_id !== teamId) {
            return json(
                { ok: false, error: "forbidden", message: "Key does not belong to the authenticated team" },
                403,
                { "Cache-Control": "no-store" },
            );
        }

        const nowVersion = Date.now();
        const idVersion = await setKeyVersion("id", data.id, nowVersion);
        const kidVersion = data.kid ? await setKeyVersion("kid", data.kid, nowVersion) : null;

        // Best-effort cleanup for any legacy unversioned key cache entries.
        if (data.kid) {
            await getCache().delete(`gateway:key:${data.kid}`);
        }

        return json(
            {
                ok: true,
                key: {
                    id: data.id,
                    kid: data.kid ?? null,
                    team_id: data.team_id,
                    status: data.status,
                },
                cache_version: {
                    id: idVersion,
                    kid: kidVersion,
                },
                message: "Key cache invalidated globally",
            },
            200,
            { "Cache-Control": "no-store" },
        );
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" },
        );
    }
}

export const keysRoutes = new Hono<Env>();

keysRoutes.post("/:id/invalidate", withRuntime(handleInvalidateKey));
