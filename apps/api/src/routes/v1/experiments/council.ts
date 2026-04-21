import { Hono } from "hono";
import { authenticate, type AuthFailure } from "@pipeline/before/auth";
import { dispatchBackground } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { buildTaskSpec } from "@/foundry/council/prompts";
import { CouncilRunCreateSchema } from "@/foundry/council/schema";
import { runCouncilOrchestration } from "@/foundry/council/orchestrator";
import { appendRunEvent, getCouncilRun, putCouncilRun } from "@/foundry/council/store";
import type { CouncilRunRecord } from "@/foundry/council/types";
import type { Env } from "@/runtime/types";

export const councilRoutes = new Hono<Env>();

const EXPERIMENTAL_HEADERS = {
	"x-aistats-experimental": "true",
	"x-aistats-experimental-feature": "council",
} as const;

function parseRunId(req: Request): string | null {
	const url = new URL(req.url);
	const parts = url.pathname.split("/").filter(Boolean);
	const runsIndex = parts.lastIndexOf("runs");
	if (runsIndex < 0 || runsIndex + 1 >= parts.length) return null;
	const maybeId = decodeURIComponent(parts[runsIndex + 1] ?? "").trim();
	return maybeId || null;
}

function parseEventsRequest(req: Request): boolean {
	const url = new URL(req.url);
	return url.pathname.endsWith("/events");
}

function parseEventsCursor(req: Request): number {
	const url = new URL(req.url);
	const sinceParam = Number(url.searchParams.get("since"));
	if (Number.isFinite(sinceParam) && sinceParam > 0) {
		return Math.floor(sinceParam);
	}

	const lastEventId = Number(req.headers.get("last-event-id"));
	if (Number.isFinite(lastEventId) && lastEventId > 0) {
		return Math.floor(lastEventId);
	}

	return 0;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requireAuth(req: Request) {
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return {
			ok: false as const,
			response: json(
				{ ok: false, error: "unauthorised", reason },
				401,
				{ "Cache-Control": "no-store" },
			),
		};
	}
	return { ok: true as const, auth };
}

async function handleCreateCouncilRun(req: Request) {
	const authResult = await requireAuth(req);
	if (!authResult.ok) return authResult.response;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return json(
			{ ok: false, error: "invalid_json" },
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const parsed = CouncilRunCreateSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				error: "invalid_request",
				details: parsed.error.flatten(),
			},
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const sourceModelSet = new Set(parsed.data.config.source_models);
	if (sourceModelSet.size !== parsed.data.config.source_models.length) {
		return json(
			{
				ok: false,
				error: "duplicate_source_models",
				message: "source_models must be unique",
			},
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const nowIso = new Date().toISOString();
	const run: CouncilRunRecord = {
		id: crypto.randomUUID(),
		feature: "council",
		workspace_id: authResult.auth.workspaceId,
		user_id: authResult.auth.userId ?? null,
		status: "queued",
		conversation_id: parsed.data.conversation_id ?? null,
		original_prompt: parsed.data.prompt,
		task_spec_json: buildTaskSpec(parsed.data.prompt),
		grounding_enabled: parsed.data.config.grounding,
		source_model_ids: parsed.data.config.source_models,
		analyser_model_id: parsed.data.config.analyser_model,
		fuser_model_id: parsed.data.config.fuser_model,
		config: parsed.data.config,
		source_results: [],
		analysis_json: null,
		final_answer_markdown: null,
		steps: [],
		events: [],
		total_cost_usd: null,
		total_input_tokens: 0,
		total_output_tokens: 0,
		error: null,
		created_at: nowIso,
		updated_at: nowIso,
		completed_at: null,
	};

	await putCouncilRun(run);
	const withCreatedEvent = await appendRunEvent(run, "run.created", {
		run_id: run.id,
	});

	const authorizationHeader = req.headers.get("authorization") ?? "";
	dispatchBackground(
		runCouncilOrchestration({
			runId: run.id,
			authorizationHeader,
		}),
	);

	return json(
		{
			ok: true,
			run_id: run.id,
			run: withCreatedEvent,
		},
		202,
		{ "Cache-Control": "no-store" },
	);
}

async function handleGetCouncilRun(req: Request) {
	const authResult = await requireAuth(req);
	if (!authResult.ok) return authResult.response;

	const runId = parseRunId(req);
	if (!runId) {
		return json(
			{ ok: false, error: "run_id_required" },
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const run = await getCouncilRun(runId);
	if (!run || run.workspace_id !== authResult.auth.workspaceId) {
		return json(
			{ ok: false, error: "not_found" },
			404,
			{ "Cache-Control": "no-store" },
		);
	}

	return json({ ok: true, run }, 200, { "Cache-Control": "no-store" });
}

async function handleCouncilRunEvents(req: Request) {
	const authResult = await requireAuth(req);
	if (!authResult.ok) return authResult.response;

	const runId = parseRunId(req);
	if (!runId || !parseEventsRequest(req)) {
		return json(
			{ ok: false, error: "run_id_required" },
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const run = await getCouncilRun(runId);
	if (!run || run.workspace_id !== authResult.auth.workspaceId) {
		return json(
			{ ok: false, error: "not_found" },
			404,
			{ "Cache-Control": "no-store" },
		);
	}

	const workspaceId = authResult.auth.workspaceId;
	const pollIntervalMs = 1_000;
	const maxStreamDurationMs = 25_000;
	const heartbeatIntervalMs = 10_000;
	let cursor = parseEventsCursor(req);

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let lastHeartbeatAt = 0;
			const startedAt = Date.now();
			const terminalStatuses = new Set(["completed", "partial", "failed"]);

			const emitEvent = (event: (typeof run.events)[number], index: number) => {
				controller.enqueue(
					encoder.encode(
						`id: ${index + 1}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
					),
				);
			};

			while (true) {
				const latest = await getCouncilRun(runId);
				if (!latest || latest.workspace_id !== workspaceId) {
					controller.enqueue(
						encoder.encode(
							`event: run.failed\ndata: ${JSON.stringify({
								type: "run.failed",
								at: new Date().toISOString(),
								data: { reason: "run_not_found" },
							})}\n\n`,
						),
					);
					break;
				}

				for (let index = cursor; index < latest.events.length; index += 1) {
					emitEvent(latest.events[index], index);
				}
				cursor = Math.max(cursor, latest.events.length);

				if (terminalStatuses.has(latest.status)) {
					break;
				}
				if (Date.now() - startedAt >= maxStreamDurationMs) {
					break;
				}

				if (Date.now() - lastHeartbeatAt >= heartbeatIntervalMs) {
					controller.enqueue(encoder.encode(`: keep-alive\n\n`));
					lastHeartbeatAt = Date.now();
				}
				await sleep(pollIntervalMs);
			}

			controller.close();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			...EXPERIMENTAL_HEADERS,
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}

// Council endpoints are experimental and always return explicit feature headers.
councilRoutes.use("*", async (c, next) => {
	await next();
	c.res.headers.set("x-aistats-experimental", EXPERIMENTAL_HEADERS["x-aistats-experimental"]);
	c.res.headers.set(
		"x-aistats-experimental-feature",
		EXPERIMENTAL_HEADERS["x-aistats-experimental-feature"],
	);
});

councilRoutes.post("/runs", withRuntime(handleCreateCouncilRun));
councilRoutes.get("/runs/:id", withRuntime(handleGetCouncilRun));
councilRoutes.get("/runs/:id/events", withRuntime(handleCouncilRunEvents));
