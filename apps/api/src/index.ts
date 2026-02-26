// src/app.ts
// Purpose: Worker entrypoint that boots Hono and registers routes.
// Why: Single place to configure the gateway app.
// How: Exposes focused helpers for this module.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { rootRouter } from "@/routes/root";
import { v1Router } from "@/routes/v1";
import { internalRouter } from "@/routes/internal";
import { handleScheduledEvent } from "@/scheduled";

const app = new Hono<Env>();

app.route("/", rootRouter);
app.route("/v1", v1Router);
app.route("/internal", internalRouter);

export default {
	fetch: app.fetch,
	scheduled: handleScheduledEvent,
};









