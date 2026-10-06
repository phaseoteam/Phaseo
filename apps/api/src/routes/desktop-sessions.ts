import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { guardAuth } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { requireOAuthWorkspaceRole } from "@/routes/v1/control/route-helpers";
import { DESKTOP_CLIENT_ID } from "@/lib/oauth/service";

export const desktopTurnSchema = z.object({
  environment_id: z.string().regex(/^[\w-]{1,200}$/),
  session_id: z.string().regex(/^[\w-]{1,200}$/),
  turn_id: z.string().min(1).max(300),
  provider: z.enum(["codex", "claudeAgent"]),
  model: z.string().min(1).max(256),
  status: z.enum(["completed", "failed", "cancelled", "interrupted"]),
  started_at: z.iso.datetime(), completed_at: z.iso.datetime(),
  input_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  output_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  usage_status: z.enum(["complete", "partial", "unavailable"]),
  desktop_scheme: z.enum(["t3code", "t3code-dev"]),
}).strict().refine((row) => Date.parse(row.completed_at) >= Date.parse(row.started_at))
  .refine((row) => row.usage_status === "complete" ? row.input_tokens !== null && row.output_tokens !== null :
    row.usage_status === "partial" ? row.input_tokens !== null || row.output_tokens !== null :
    row.input_tokens === null && row.output_tokens === null);

export async function handleDesktopSessionTurn(req: Request) {
  const auth = await guardAuth(req, { allowOAuthJwt: true, useKvCache: false });
  if (auth.ok === false) return auth.response;
  const identity = auth.value;
  if (identity.authMethod !== "oauth" || identity.oauthClientId !== DESKTOP_CLIENT_ID ||
      !identity.userId || !identity.oauthScopes?.includes("gateway:access")) {
    return json({ error: "forbidden" }, 403);
  }
  const roleError = await requireOAuthWorkspaceRole(identity, identity.workspaceId, ["owner", "admin", "member"]);
  if (roleError) return roleError;
  if (Number(req.headers.get("content-length")) > 4096) return json({ error: "payload_too_large" }, 413);
  const reader = req.body?.getReader();
  if (!reader) return json({ error: "invalid_request" }, 400);
  let body = "", size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return json({ error: "payload_too_large" }, 413); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(body); } catch { return json({ error: "invalid_request" }, 400); }
  const parsed = desktopTurnSchema.safeParse(input);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const result = await getSupabaseAdmin().from("desktop_session_turns").upsert({
    ...parsed.data, workspace_id: identity.workspaceId, user_id: identity.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,user_id,environment_id,turn_id" });
  if (result.error) return json({ error: "session_sync_unavailable" }, 503);
  return json({ ok: true }, 200, { "Cache-Control": "no-store" });
}
export const desktopSessionsRoutes = new Hono<Env>();
desktopSessionsRoutes.post("/session-turns", withRuntime(handleDesktopSessionTurn));
