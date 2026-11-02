import { Hono } from "hono";
import { z } from "zod";
import type { GatewayBindings } from "@/runtime/env.types";
import type { Env } from "@/runtime/types";

const MAX_TITLE_LENGTH = 200;
const MAX_EXCEPTION_SUMMARY_LENGTH = 500;

// Error messages can embed URLs with query values, emails or keys; keep only what triage needs.
function redact(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.replace(/((?:\bhttps?:\/\/|(?<![\w/.])\/)[^\s?#"'<>]*)[?#][^\s"'<>]*?(?=[:.,;)]?(?:\s|$))/gi, "$1")
		.replace(/[^\s@<>()"'`]+@[^\s@<>()"'`]+\.[A-Za-z]{2,}/g, "[email]")
		.replace(/(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{24,}/g, "[redacted]")
		.trim();
}

function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

// Producer templates render a missing event property as null or an empty string.
function optional<T extends z.ZodType>(schema: T) {
	return z.preprocess((value) => (value === null || value === "" ? undefined : value), schema.optional());
}

const IncidentSchema = z.object({
	source: z.enum(["axiom", "posthog"]),
	action: z.enum(["open", "resolved", "repeated"]).default("open"),
	fingerprint: z.string().trim().min(1).max(500),
	title: z.string().trim().min(1).max(2_000).transform((title) => truncate(redact(title), MAX_TITLE_LENGTH)),
	description: optional(z.string().trim().max(10_000)),
	severity: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
	environment: optional(z.string().trim().max(100)),
	source_url: z.string().url().max(2_000),
	replay_url: optional(z.string().url().max(2_000)),
	release: optional(z.string().trim().max(300)),
	route: optional(z.string().trim().max(1_000).transform((route) => route.split(/[?#]/)[0])),
	exception_type: optional(z.string().trim().max(200)),
	exception_message: optional(z.string().trim().max(10_000)),
	request_ids: z.preprocess((value) => value ?? undefined, z.array(z.string().trim().min(1).max(200)).max(20).default([])),
	occurrences: optional(z.number().int().nonnegative()),
	affected_users: optional(z.number().int().nonnegative()),
});

type Incident = z.infer<typeof IncidentSchema>;
type IncidentMapping = {
	issueId: string;
	identifier: string;
	url: string;
	lastNotifiedAt: string;
};

const LINEAR_API_URL = "https://api.linear.app/graphql";
const MAPPING_TTL_SECONDS = 60 * 60 * 24 * 365;
const REPEAT_COMMENT_INTERVAL_MS = 15 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
	const left = new TextEncoder().encode(a);
	const right = new TextEncoder().encode(b);
	if (left.length !== right.length) return false;
	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
	return mismatch === 0;
}

function isAuthorized(authorization: string | undefined, secret: string | undefined): boolean {
	if (!secret || secret.length < 32) return false;
	const provided = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
	return provided.length > 0 && timingSafeEqual(provided, secret);
}

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function mappingKey(incident: Incident): Promise<string> {
	return `observability-linear:${toHex(await sha256(`${incident.source}:${incident.fingerprint}`))}`;
}

// Linear rejects a second create with the same client-supplied id, which makes concurrent or
// retried deliveries idempotent where KV get-then-put cannot be.
async function stableLinearId(name: string): Promise<string> {
	const bytes = (await sha256(name)).slice(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = toHex(bytes);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function priorityFor(severity: Incident["severity"]): number {
	return { urgent: 1, high: 2, medium: 3, low: 4 }[severity];
}

function sourceName(incident: Incident): string {
	return incident.source === "posthog" ? "PostHog" : "Axiom";
}

function exceptionSummary(incident: Incident): string | null {
	if (!incident.exception_type && !incident.exception_message) return null;
	const type = `\`${redact(incident.exception_type ?? "Error").replace(/`/g, "'")}\``;
	if (!incident.exception_message) return type;
	return `${type}: ${truncate(redact(incident.exception_message), MAX_EXCEPTION_SUMMARY_LENGTH).replace(/`/g, "'")}`;
}

function incidentDescription(incident: Incident): string {
	const exception = exceptionSummary(incident);
	const context = [
		`- Source: ${sourceName(incident)}`,
		`- Environment: ${incident.environment ?? "unknown"}`,
		exception ? `- Exception: ${exception}` : null,
		incident.route ? `- Route: \`${incident.route}\`` : null,
		incident.release ? `- Release: \`${incident.release}\`` : null,
		incident.occurrences !== undefined ? `- Occurrences: ${incident.occurrences}` : null,
		incident.affected_users !== undefined ? `- Affected users: ${incident.affected_users}` : null,
		incident.request_ids.length ? `- Request IDs: ${incident.request_ids.map((id) => `\`${id}\``).join(", ")}` : null,
		`- [Open in ${sourceName(incident)}](${incident.source_url})`,
		incident.replay_url ? `- [Open session replay](${incident.replay_url}) (exists only if PostHog recorded the session)` : null,
	].filter(Boolean).join("\n");
	return `${incident.description ? `${incident.description}\n\n` : ""}## Incident context\n\n${context}\n\n<!-- observability:${incident.source}:${incident.fingerprint} -->`;
}

async function linearRequest<T>(bindings: GatewayBindings, query: string, variables: Record<string, unknown>): Promise<T> {
	if (!bindings.LINEAR_API_KEY) throw new Error("linear_api_key_not_configured");
	const response = await fetch(LINEAR_API_URL, {
		method: "POST",
		headers: { authorization: bindings.LINEAR_API_KEY, "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});
	const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
	if (!response.ok || payload.errors?.length || !payload.data) {
		throw new Error(`linear_request_failed:${payload.errors?.[0]?.message ?? response.status}`);
	}
	return payload.data;
}

function requiredLinearConfig(bindings: GatewayBindings) {
	const config = {
		teamId: bindings.LINEAR_TEAM_ID,
		projectId: bindings.LINEAR_PROJECT_ID,
		stateId: bindings.LINEAR_TRIAGE_STATUS_ID,
		assigneeId: bindings.LINEAR_ASSIGNEE_ID,
		labelId: bindings.LINEAR_OBSERVABILITY_LABEL_ID,
	};
	if (Object.values(config).some((value) => !value)) throw new Error("linear_destination_not_configured");
	return config as Record<keyof typeof config, string>;
}

type LinearIssue = { id: string; identifier: string; url: string };

async function findIssue(bindings: GatewayBindings, id: string): Promise<LinearIssue | null> {
	const data = await linearRequest<{ issue: LinearIssue | null }>(bindings, `query FindObservabilityIssue($id: String!) {
		issue(id: $id) { id identifier url }
	}`, { id }).catch(() => null);
	return data?.issue ?? null;
}

async function createIssue(bindings: GatewayBindings, incident: Incident): Promise<{ issue: LinearIssue; created: boolean }> {
	const config = requiredLinearConfig(bindings);
	const id = await stableLinearId(`observability-linear-issue:${incident.source}:${incident.fingerprint}`);
	try {
		const data = await linearRequest<{
			issueCreate: { success: boolean; issue: LinearIssue };
		}>(bindings, `mutation CreateObservabilityIssue($input: IssueCreateInput!) {
			issueCreate(input: $input) { success issue { id identifier url } }
		}`, {
			input: {
				id,
				title: incident.title,
				description: incidentDescription(incident),
				teamId: config.teamId,
				projectId: config.projectId,
				stateId: config.stateId,
				assigneeId: config.assigneeId,
				labelIds: [config.labelId, incident.source === "posthog" ? "045f0664-0f61-4df8-8496-a048591f010a" : "51a317cb-ec4f-422a-8e0f-6662cc30b7e0"],
				priority: priorityFor(incident.severity),
			},
		});
		if (!data.issueCreate.success) throw new Error("linear_issue_create_failed");
		return { issue: data.issueCreate.issue, created: true };
	} catch (error) {
		// Another delivery won the create, or KV lost the mapping after an earlier create.
		const existing = await findIssue(bindings, id);
		if (existing) return { issue: existing, created: false };
		throw error;
	}
}

async function addComment(bindings: GatewayBindings, mappingId: string, issueId: string, incident: Incident): Promise<boolean> {
	const verb = incident.action === "resolved" ? "resolved" : "recurred";
	const throttleWindow = Math.floor(Date.now() / REPEAT_COMMENT_INTERVAL_MS);
	const id = await stableLinearId(`observability-linear-comment:${mappingId}:${verb}:${throttleWindow}`);
	const exception = exceptionSummary(incident);
	const details = [
		`The ${sourceName(incident)} signal ${verb}.`,
		exception ? `Exception: ${exception}` : null,
		incident.route ? `Route: \`${incident.route}\`` : null,
		incident.release ? `Release: \`${incident.release}\`` : null,
		incident.occurrences !== undefined ? `Occurrences: ${incident.occurrences}.` : null,
		incident.affected_users !== undefined ? `Affected users: ${incident.affected_users}.` : null,
		`[Open source incident](${incident.source_url})`,
		incident.replay_url ? `[Open session replay](${incident.replay_url})` : null,
	].filter(Boolean).join("\n\n");
	try {
		await linearRequest(bindings, `mutation CommentOnObservabilityIssue($input: CommentCreateInput!) {
			commentCreate(input: $input) { success }
		}`, { input: { id, issueId, body: details } });
		return true;
	} catch (error) {
		const existing = await linearRequest<{ comment: { id: string } | null }>(bindings, `query FindObservabilityComment($id: String!) {
			comment(id: $id) { id }
		}`, { id }).catch(() => null);
		if (existing?.comment) return false;
		throw error;
	}
}

async function handleIncident(bindings: GatewayBindings, incident: Incident): Promise<IncidentMapping & { created: boolean; commented: boolean }> {
	const key = await mappingKey(incident);
	const existing = await bindings.GATEWAY_CACHE.get<IncidentMapping>(key, "json");
	if (!existing) {
		if (incident.action === "resolved") throw new Error("incident_mapping_not_found");
		const { issue, created } = await createIssue(bindings, incident);
		const mapping = { issueId: issue.id, identifier: issue.identifier, url: issue.url, lastNotifiedAt: new Date().toISOString() };
		await bindings.GATEWAY_CACHE.put(key, JSON.stringify(mapping), { expirationTtl: MAPPING_TTL_SECONDS });
		return { ...mapping, created, commented: false };
	}

	const lastNotified = Date.parse(existing.lastNotifiedAt);
	const shouldComment = incident.action === "resolved" || !Number.isFinite(lastNotified) || Date.now() - lastNotified >= REPEAT_COMMENT_INTERVAL_MS;
	if (!shouldComment) return { ...existing, created: false, commented: false };

	const commented = await addComment(bindings, key, existing.issueId, incident);
	const updated = { ...existing, lastNotifiedAt: new Date().toISOString() };
	await bindings.GATEWAY_CACHE.put(key, JSON.stringify(updated), { expirationTtl: MAPPING_TTL_SECONDS });
	return { ...updated, created: false, commented };
}

export const internalObservabilityIncidentRoutes = new Hono<Env>();

internalObservabilityIncidentRoutes.post("/", async (c) => {
	if (!isAuthorized(c.req.header("authorization"), c.env.OBSERVABILITY_WEBHOOK_SECRET)) {
		return c.json({ error: "unauthorized" }, 401);
	}

	const body = await c.req.json().catch(() => null);
	const parsed = IncidentSchema.safeParse(body);
	if (!parsed.success) return c.json({ error: "invalid_incident", issues: parsed.error.issues }, 400);

	try {
		const result = await handleIncident(c.env, parsed.data);
		return c.json(result, result.created ? 201 : 200);
	} catch (error) {
		console.error("observability_linear_sync_failed", { source: parsed.data.source, fingerprint: parsed.data.fingerprint, error });
		return c.json({ error: "incident_sync_failed" }, 502);
	}
});

export const observabilityIncidentInternals = { IncidentSchema, handleIncident, incidentDescription, isAuthorized, mappingKey, redact };
