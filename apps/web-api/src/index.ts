import { Hono } from "hono";
import type { Env } from "@/env";
import { accountRouter } from "@/routes/account";
import { internalRouter } from "@/routes/internal";
import { publicRouter } from "@/routes/public";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/public", publicRouter);
app.route("/api/account", accountRouter);
app.route("/api/internal", internalRouter);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
