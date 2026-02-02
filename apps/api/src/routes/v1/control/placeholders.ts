// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json } from "../../utils";

const notImplemented = (name: string) => (c: any) =>
  c.json({ ok: false, error: "not_implemented", message: `${name} not implemented` }, 501, { "Cache-Control": "no-store" });

export const placeholdersRoutes = new Hono<Env>();

placeholdersRoutes.get("/credits", notImplemented("credits.get"));
placeholdersRoutes.get("/endpoints", notImplemented("endpoints.list"));
placeholdersRoutes.get("/keys", notImplemented("keys.list"));
placeholdersRoutes.post("/keys", notImplemented("keys.create"));
placeholdersRoutes.get("/key", notImplemented("key.get"));

