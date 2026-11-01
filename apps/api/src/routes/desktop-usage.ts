import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { guardAuth } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { checkOAuthRateLimit } from "@/lib/oauth/rateLimit";
import { DESKTOP_CLIENT_ID } from "@/lib/oauth/service";

// Desktop credentials may read only their own existing request metadata.
export async function handleDesktopUsage(req: Request) {
  const auth = await guardAuth(req, { allowOAuthJwt: true, useKvCache: false });
  if (auth.ok === false) return auth.response;
  const identity = auth.value;
  if (identity.authMethod !== "oauth" || identity.oauthClientId !== DESKTOP_CLIENT_ID ||
      !identity.apiKeyId || !identity.oauthScopes?.includes("gateway:access"))
    return json({ error: "forbidden" }, 403, { "Cache-Control": "no-store" });
  const limited = new Request(req.url, { headers: { "cf-connecting-ip": "desktop-usage" } });
  if (!await checkOAuthRateLimit(limited, "token", `desktop-usage:${identity.workspaceId}:${identity.apiKeyId}`))
    return json({ error: "rate_limited" }, 429, { "Retry-After": "60", "Cache-Control": "no-store" });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) ||
      Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 92 * 86400000 ||
      !Number.isInteger(offset) || offset < 0 || offset > 9000)
    return json({ error: "invalid_request" }, 400, { "Cache-Control": "no-store" });
  const result = await getSupabaseAdmin().from("gateway_requests")
    .select("request_id,model_id,usage,cost_nanos,created_at")
    .eq("workspace_id", identity.workspaceId).eq("key_id", identity.apiKeyId)
    .gte("created_at", new Date(from).toISOString()).lt("created_at", new Date(to).toISOString())
    .order("created_at", { ascending: false }).order("request_id", { ascending: false })
    .range(offset, offset + 999);
  if (result.error) return json({ error: "usage_unavailable" }, 503, { "Cache-Control": "no-store" });
  const count = (value: unknown) => {
    const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  const rows = (result.data ?? []).map((row) => {
    const usage = row.usage && typeof row.usage === "object" && !Array.isArray(row.usage)
      ? row.usage as Record<string, unknown> : {};
    return { request_id: row.request_id, model: row.model_id, created_at: row.created_at,
      input_tokens: count(usage.input_tokens ?? usage.prompt_tokens),
      output_tokens: count(usage.output_tokens ?? usage.completion_tokens),
      cost_nanos: count(row.cost_nanos) };
  });
  return json({ source_id: `${identity.workspaceId}:${identity.apiKeyId}`, rows,
    has_more: rows.length === 1000 }, 200, { "Cache-Control": "no-store" });
}
export const desktopUsageRoutes = new Hono<Env>();
desktopUsageRoutes.get("/usage", withRuntime(handleDesktopUsage));
