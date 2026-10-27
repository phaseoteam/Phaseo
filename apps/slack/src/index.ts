import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "./env";
import { defaultDeps, isRemovalEvent, processEvent, type Deps, type SlackEnvelope } from "./events";
import { companyApp, hostedApp, SLACK_APP_ID_PATTERN, type SlackAppContext } from "./installations";
import { handleInteraction, type InteractionPayload } from "./interactions";
import { finishSignIn, servePage } from "./page-viewer";
import { verifySlackSignature } from "./signature";

export { SlackAgentAdmin } from "./admin";
export { ThreadCoordinator } from "./coordinator";
export { WorkspaceMeter } from "./meter";
export { PageStore } from "./pages";
export { AgentTurnWorkflow } from "./workflow";
export { defaultDeps };

// The Phaseo Slack agent's Worker (slack.phaseo.app).
//
//   POST /events                Events API, hosted Phaseo app
//   POST /events/:appId         Events API, a company's own app (Slack app id A...)
//   POST /interactions[/:appId] Button clicks
//   GET  /p/:store/:page        A shared page (pages.ts, page-viewer.ts)
//   GET  /p/signin              Sign in with Slack, for pages shared with a workspace
//   GET  /health
//
// Every Slack request is verified (v0 signature over the raw body, five-minute
// window) and acknowledged at once; the work runs after the response in
// waitUntil, since Slack wants an answer within three seconds. Retries
// (X-Slack-Retry-Num) are acknowledged too and deduped by event id. The app being
// removed in Slack is the exception: it is handled before the answer, so Slack
// retries it if the database is unavailable.

const MAX_BODY_BYTES = 512 * 1024;

type AppEnv = { Bindings: Env };

async function resolveApp(deps: Deps, appId: string | undefined): Promise<SlackAppContext | null> {
	if (appId === undefined) return hostedApp(deps.env);
	if (!SLACK_APP_ID_PATTERN.test(appId)) return null;
	return companyApp(deps.env, deps.db, appId);
}

/** Verifies a Slack request for the hosted app or a company's own app. Returns the raw body, or a response to send. */
async function verified(c: Context<AppEnv>, deps: Deps, kind: "events" | "interactions"): Promise<{ app: SlackAppContext; body: string } | Response> {
	const appId = c.req.param("appId");
	const body = await c.req.text();
	let app: SlackAppContext | null;
	try {
		app = await resolveApp(deps, appId);
	} catch {
		console.error("[slack-agent] app lookup failed", { kind, appId: appId ?? "hosted" });
		return c.json({ error: "unavailable" }, 503);
	}
	if (!app) return appId === undefined ? c.json({ error: "not_configured" }, 503) : c.json({ error: "unknown_app" }, 404);
	const check = await verifySlackSignature({
		signingSecret: app.signingSecret,
		timestamp: c.req.header("x-slack-request-timestamp"),
		signature: c.req.header("x-slack-signature"),
		body,
		now: deps.now(),
	});
	if (check !== "ok") {
		console.warn("[slack-agent] request refused", { kind, appId: appId ?? "hosted", check });
		return c.json({ error: "invalid_signature" }, 401);
	}
	return { app, body };
}

export function createApp(makeDeps: (env: Env) => Deps = defaultDeps) {
	const app = new Hono<AppEnv>();
	const limit = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "payload_too_large" }, 413) });

	app.get("/health", (c) => c.json({ ok: true, service: "phaseo-slack-agent" }));

	const events = async (c: Context<AppEnv>) => {
		const deps = makeDeps(c.env);
		const request = await verified(c, deps, "events");
		if (request instanceof Response) return request;
		let envelope: SlackEnvelope;
		try {
			envelope = JSON.parse(request.body) as SlackEnvelope;
		} catch {
			return c.json({ error: "invalid_json" }, 400);
		}
		if (envelope.type === "url_verification") return c.json({ challenge: String(envelope.challenge ?? "") });
		if (envelope.type !== "event_callback") return c.body(null, 200);
		if (request.app.slackAppId && envelope.api_app_id !== request.app.slackAppId) {
			console.warn("[slack-agent] event for another app", { appId: request.app.slackAppId });
			return c.json({ error: "wrong_app" }, 403, { "x-slack-no-retry": "1" });
		}
		const retry = c.req.header("x-slack-retry-num");
		if (retry) console.log("[slack-agent] slack retry", { eventId: envelope.event_id, retry, reason: c.req.header("x-slack-retry-reason") ?? null });
		// An uninstall must not be lost: it is handled before answering (a few quick database
		// calls), and a failure asks Slack to send it again. Handling it twice is safe.
		if (isRemovalEvent(envelope)) {
			const outcome = await processEvent({ ...deps, waitUntil: (work) => c.executionCtx.waitUntil(work) }, request.app, envelope);
			return outcome === "error" ? c.json({ error: "unavailable" }, 500) : c.body(null, 200);
		}
		c.executionCtx.waitUntil(processEvent(deps, request.app, envelope));
		return c.body(null, 200);
	};

	const interactions = async (c: Context<AppEnv>) => {
		const deps = makeDeps(c.env);
		const request = await verified(c, deps, "interactions");
		if (request instanceof Response) return request;
		let payload: InteractionPayload;
		try {
			payload = JSON.parse(new URLSearchParams(request.body).get("payload") ?? "") as InteractionPayload;
		} catch {
			return c.json({ error: "invalid_payload" }, 400);
		}
		if (request.app.slackAppId && payload.api_app_id !== request.app.slackAppId) return c.json({ error: "wrong_app" }, 403);
		c.executionCtx.waitUntil(handleInteraction(deps, request.app, payload));
		return c.body(null, 200);
	};

	app.post("/events", limit, events);
	app.post("/events/:appId", limit, events);
	app.post("/interactions", limit, interactions);
	app.post("/interactions/:appId", limit, interactions);
	app.get("/p/signin", (c) => finishSignIn(makeDeps(c.env), c.req.raw));
	app.get("/p/:store/:page", (c) => servePage(makeDeps(c.env), c.req.raw, c.req.param("store"), c.req.param("page")));
	app.notFound((c) => c.json({ error: "not_found" }, 404));
	app.onError((error, c) => {
		console.error("[slack-agent] request failed", { path: c.req.path, error: error.message });
		return c.json({ error: "internal_error" }, 500);
	});
	return app;
}

export default createApp();
