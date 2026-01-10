// src/app.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { rootRouter } from "@/routes/root";
import { v1Router } from "@/routes/v1";

const app = new Hono<Env>();

app.route("/", rootRouter);
app.route("/v1", v1Router);

export default app;
