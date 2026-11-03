import { Hono } from "hono";
import type { Env } from "@/env";
import { runWithDataScope } from "@/data/scope";
import { accountRouter } from "@/routes/account";
import { internalRouter } from "@/routes/internal";
import { chatRouter } from "@/routes/chat";
import { publicRouter } from "@/routes/public";
import { frontendRouter } from "@/routes/frontend";
import { frontendCreditAvailabilityRouter } from "@/routes/frontend-credit-availability";
import { frontendProfileAvatarsRouter } from "@/routes/frontend-profile-avatars";
import { scimRouter } from "@/scim/router";
import { handleProviderCatalogScheduledEvent } from "@/scheduled/provider-catalog";
import { handleSlackAgentChargesScheduledEvent } from "@/scheduled/slack-agent-charges";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/_web", publicRouter);
app.route("/api/account", accountRouter);
app.route("/api/internal", internalRouter);
app.route("/api/chat", chatRouter);
app.route("/api/_web", frontendRouter);
app.route("/api/_web", frontendCreditAvailabilityRouter);
app.route("/api/_web", frontendProfileAvatarsRouter);
app.route("/scim/v2", scimRouter);

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Every invocation runs in a database scope: a no-op under DATABASE_PROVIDER=supabase (the default); under
// planetscale it holds the invocation's Hyperdrive connection and ends it after the work is done.
const honoFetch = app.fetch;

export default Object.assign(app, {
	fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
		return runWithDataScope(env, executionCtx, (ctx) => honoFetch(request, env, ctx));
	},
	async scheduled(event: ScheduledController, env: Env, executionCtx: ExecutionContext): Promise<void> {
		await runWithDataScope(env, executionCtx, async (ctx) => {
			await Promise.all([
				handleProviderCatalogScheduledEvent(event, env, ctx),
				handleSlackAgentChargesScheduledEvent(event, env),
			]);
		});
	},
});
