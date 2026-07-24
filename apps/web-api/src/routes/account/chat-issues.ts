import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const CHAT_ISSUE_RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS = 60 * 60;

type IncomingErrorDetail = {
	message?: unknown;
	path?: unknown;
	keyword?: unknown;
};

type IncomingChatIssueError = {
	status?: unknown;
	message?: unknown;
	errorCode?: unknown;
	requestId?: unknown;
	description?: unknown;
	details?: unknown;
	routingDiagnostics?: unknown;
	modelId?: unknown;
	providerId?: unknown;
	endpoint?: unknown;
	timestamp?: unknown;
};

type ChatIssueRateLimitRow = {
	allowed?: unknown;
	remaining?: unknown;
	retry_after_seconds?: unknown;
};

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function normalizeDetails(value: unknown): Array<{
	message: string;
	path?: string[];
	keyword?: string;
}> {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
			const detail = entry as IncomingErrorDetail;
			const message = asString(detail?.message);
			if (!message) return [];
			return [{
				message,
				path: Array.isArray(detail?.path)
					? detail.path
							.map((item) => asString(item))
							.filter((item): item is string => Boolean(item))
					: undefined,
				keyword: asString(detail?.keyword) ?? undefined,
			}];
		});
}

function buildIssueTitle(error: {
	modelId: string;
	status: number | null;
	errorCode: string | null;
	description: string | null;
}): string {
	const summary =
		error.description ??
		error.errorCode ??
		(error.status ? `HTTP ${error.status}` : "request failure");
	return `[Chat] ${error.modelId} failed: ${summary}`;
}

function buildIssueBody(args: {
	error: {
		status: number | null;
		message: string;
		errorCode: string | null;
		requestId: string | null;
		description: string | null;
		details: Array<{ message: string; path?: string[]; keyword?: string }>;
		routingDiagnostics?: Record<string, unknown> | null;
		modelId: string;
		providerId: string | null;
		endpoint: string;
		timestamp: string | null;
	};
	threadTitle: string | null;
	pageUrl: string | null;
	notes: string | null;
	userEmail: string | null;
}): string {
	const detailLines = args.error.details.length
		? args.error.details
				.map((detail) => {
					const suffix = detail.path?.length
						? ` (path: ${detail.path.join(" / ")})`
						: "";
					return `- ${detail.message}${suffix}`;
				})
				.join("\n")
		: "- None provided";

	return [
		"## Summary",
		"",
		args.error.description ?? args.error.message,
		"",
		"## Context",
		"",
		`- Model: \`${args.error.modelId}\``,
		`- Provider lock: \`${args.error.providerId ?? "auto"}\``,
		`- Endpoint: \`${args.error.endpoint}\``,
		`- HTTP status: \`${args.error.status ?? "unknown"}\``,
		`- Error code: \`${args.error.errorCode ?? "unknown"}\``,
		`- Request ID: \`${args.error.requestId ?? "unknown"}\``,
		`- Thread title: ${args.threadTitle ?? "unknown"}`,
		`- Page URL: ${args.pageUrl ?? "unknown"}`,
		`- Timestamp: ${args.error.timestamp ?? "unknown"}`,
		`- Reporter: ${args.userEmail ?? "unknown"}`,
		"",
		"## Validation details",
		"",
		detailLines,
		"",
		"## Routing diagnostics",
		"",
		"```json",
		JSON.stringify(args.error.routingDiagnostics ?? null, null, 2),
		"```",
		"",
		"## User notes",
		"",
		args.notes ?? "None provided.",
	].join("\n");
}

function buildPrefilledIssueUrl(repo: string, title: string, body: string): string {
	return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function buildIssueFingerprint(error: {
	status: number | null;
	errorCode: string | null;
	requestId: string | null;
	description: string | null;
	modelId: string;
	providerId: string | null;
	endpoint: string;
}): string {
	return [
		error.modelId,
		error.providerId ?? "auto",
		error.endpoint,
		error.status ?? "unknown",
		error.errorCode ?? "unknown",
		error.requestId ?? error.description ?? "unknown",
	]
		.join("|")
		.slice(0, 500);
}

function normalizeRateLimitRow(data: unknown): {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number | null;
} | null {
	const row = Array.isArray(data) ? data[0] : data;
	const object = asObject(row) as ChatIssueRateLimitRow | null;
	if (!object || typeof object.allowed !== "boolean") return null;

	return {
		allowed: object.allowed,
		remaining: Math.max(0, asInteger(object.remaining) ?? 0),
		retryAfterSeconds:
			asInteger(object.retry_after_seconds) ??
			asInteger((object as Record<string, unknown>).retryAfterSeconds),
	};
}

async function reserveAutomaticIssueReport(args: {
	supabase: SupabaseClient;
	error: {
		status: number | null;
		errorCode: string | null;
		requestId: string | null;
		description: string | null;
		modelId: string;
		providerId: string | null;
		endpoint: string;
	};
}): Promise<{
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number | null;
}> {
	const { data, error } = await args.supabase.rpc(
		"reserve_chat_issue_report",
		{
			p_issue_fingerprint: buildIssueFingerprint(args.error),
			p_model_id: args.error.modelId,
			p_request_id: args.error.requestId,
		},
	);

	if (error) {
		console.error("[chat-issues] issue report rate limit check failed", error);
		return {
			allowed: false,
			remaining: 0,
			retryAfterSeconds: CHAT_ISSUE_RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS,
		};
	}

	return normalizeRateLimitRow(data) ?? {
		allowed: false,
		remaining: 0,
		retryAfterSeconds: CHAT_ISSUE_RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS,
	};
}

export const accountChatIssuesRouter = new Hono<{ Bindings: Env }>();

accountChatIssuesRouter.post("/issues", async (c) => {
	const req = c.req.raw;
	const user = await requireUser(req, c.env);

	let payload: Record<string, unknown>;
	try {
		payload = (await req.json()) as Record<string, unknown>;
	} catch {
		return c.json({ error: "Invalid request body" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const errorInput = asObject(payload.error) as IncomingChatIssueError | null;
	const modelId = asString(errorInput?.modelId);
	const endpoint = asString(errorInput?.endpoint);
	if (!errorInput || !modelId || !endpoint) {
		return c.json({ error: "Missing error diagnostics" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const normalizedError = {
		status: asNumber(errorInput.status),
		message: asString(errorInput.message) ?? "Chat request failed",
		errorCode: asString(errorInput.errorCode),
		requestId: asString(errorInput.requestId),
		description: asString(errorInput.description),
		details: normalizeDetails(errorInput.details),
		routingDiagnostics: asObject(errorInput.routingDiagnostics),
		modelId,
		providerId: asString(errorInput.providerId),
		endpoint,
		timestamp: asString(errorInput.timestamp),
	};

	const repo =
		asString(c.env.GITHUB_REPOSITORY) ?? "phaseoteam/Phaseo";
	const title = buildIssueTitle(normalizedError);
	const body = buildIssueBody({
		error: normalizedError,
		threadTitle: asString(payload.threadTitle),
		pageUrl: asString(payload.pageUrl),
		notes: asString(payload.notes),
		userEmail: asString(user?.email),
	});
	const fallbackUrl = buildPrefilledIssueUrl(repo, title, body);
	const token =
		asString(c.env.GITHUB_TOKEN) ??
		asString(c.env.GH_TOKEN);

	if (!token || !user?.id) {
		return c.json({
			ok: true,
			created: false,
			issueUrl: fallbackUrl,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}

	const supabase = getDataClient(c.env);
	const rateLimit = await reserveAutomaticIssueReport({
		supabase,
		error: normalizedError,
	});
	if (!rateLimit.allowed) {
		return c.json({
			ok: true,
			created: false,
			issueUrl: fallbackUrl,
			rateLimited: true,
			retryAfterSeconds: rateLimit.retryAfterSeconds,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}

	try {
		const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				"User-Agent": "Phaseo-Chat-Issue-Reporter",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			body: JSON.stringify({
				title,
				body,
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			console.error("[chat-issues] github issue creation failed", {
				status: response.status,
				body: failureText,
			});
			return c.json({
				ok: true,
				created: false,
				issueUrl: fallbackUrl,
			}, 200, PRIVATE_NO_STORE_HEADERS);
		}

		const created = (await response.json()) as {
			html_url?: string;
			number?: number;
		};
		return c.json({
			ok: true,
			created: true,
			issueUrl: created.html_url ?? fallbackUrl,
			issueNumber: created.number ?? null,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[chat-issues] github request failed", error);
		return c.json({
			ok: true,
			created: false,
			issueUrl: fallbackUrl,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
});
