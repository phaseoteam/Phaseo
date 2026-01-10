// src/routes/v1/control/health.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

export const healthRoutes = new Hono<Env>();

healthRoutes.get("/z", c => c.json({ status: 'ok' }));
