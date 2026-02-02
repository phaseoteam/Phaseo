// src/routes/v1/control/health.ts
// Purpose: Control-plane route handler for health operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

export const healthRoutes = new Hono<Env>();

healthRoutes.get("/z", c => c.json({ status: 'ok' }));









