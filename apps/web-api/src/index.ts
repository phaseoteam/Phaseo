import { Hono } from "hono";
import type { Env } from "@/env";
import { accountRouter } from "@/routes/account";
import { internalRouter } from "@/routes/internal";
import { publicRouter } from "@/routes/public";
import { faviconRouter } from "@/routes/favicon";
import { frontendRouter } from "@/routes/frontend";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/public", publicRouter);
app.route("/api/account", accountRouter);
app.route("/api/internal", internalRouter);
app.route("/api/frontend", frontendRouter);
app.route("/", faviconRouter);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
