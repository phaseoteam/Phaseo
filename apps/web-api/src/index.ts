import { Hono } from "hono";
import type { Env } from "@/env";
import { accountRouter } from "@/routes/account";
import { internalRouter } from "@/routes/internal";
import { chatRouter } from "@/routes/chat";
import { publicRouter } from "@/routes/public";
import { frontendRouter } from "@/routes/frontend";
import { stripeWebhookRouter } from "@/routes/webhooks/stripe-checkout";
import { runScheduledWatchers } from "@/watchers/run";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/_web", publicRouter);
app.route("/api/account", accountRouter);
app.route("/api/internal", internalRouter);
app.route("/api/chat", chatRouter);
app.route("/api/_web", frontendRouter);
app.route("/api/webhooks", stripeWebhookRouter);

app.notFound((c) => c.json({ error: "not_found" }, 404));

const worker = Object.assign(app, {
	scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(runScheduledWatchers(env, ctx));
	},
});

export default worker;
