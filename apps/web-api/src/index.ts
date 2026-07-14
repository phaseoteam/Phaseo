import { Hono } from "hono";
import type { Env } from "@/env";
import { accountRouter } from "@/routes/account";
import { internalRouter } from "@/routes/internal";
import { publicRouter } from "@/routes/public";
import { frontendRouter } from "@/routes/frontend";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/_web", publicRouter);
app.route("/api/account", accountRouter);
app.route("/api/internal", internalRouter);
app.route("/api/_web", frontendRouter);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
