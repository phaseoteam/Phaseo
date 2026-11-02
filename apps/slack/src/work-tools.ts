import type { AgentTool } from "@phaseo/agent-sdk";
import { webOrigin } from "./access";
import type { Env } from "./env";
import type { Installation } from "./installations";
import type { SlackClient } from "./slack-api";
import { savingRefusal, type SearchedThisAnswer } from "./slack-search";
import type { Db } from "./supabase";
import type { TurnRef } from "./turns";

// file_work_item: people in Slack file work into the Phaseo work tracker from a thread ("file this
// as a work item", "log this ask for <customer>"). The tool posts to web-api's
// POST /api/internal/work/slack/items, which creates the item (or a private customer request plus
// an item) in the installation's workspace, links the Slack thread and triages it.
//
// Auth: the request is signed with SLACK_STATE_SECRET, which this Worker and web-api already share:
//   x-phaseo-signature: v1=<hex HMAC-SHA256(secret, "work-slack.v1.<timestamp>.<raw body>")>
// web-api accepts it within 5 minutes.
//
// Gate: the work tracker is an internal prototype. The tool is offered only when the
// installation's workspace has a Phaseo internal admin (its owner or a member whose users.role is
// 'admin'), the role web-api's internal routes check; web-api checks again. It is never offered to
// people from another organisation, in scheduled runs, or without the shared secret. Like every
// tool that keeps what the model writes, it refuses once the answer has searched Slack.

export const FILE_WORK_ITEM_TOOL_ID = "file_work_item";
export const WORK_SIGNATURE_CONTEXT = "work-slack.v1";
const GATE_TTL_MS = 10 * 60_000;
const GATE_CACHE_LIMIT = 1_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 20_000;
const MAX_CUSTOMER = 200;
const encoder = new TextEncoder();

/** The signature header value for a request body. */
export async function signWorkRequest(secret: string, timestamp: number, rawBody: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${WORK_SIGNATURE_CONTEXT}.${timestamp}.${rawBody}`)));
	return `v1=${[...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function quoted(values: string[]): string {
	return `in.(${values.map((value) => `"${value.replace(/["\\]/g, "\\$&")}"`).join(",")})`;
}

const gateCache = new Map<string, { enabled: boolean; expiresAt: number }>();

export function clearWorkGateCache(): void {
	gateCache.clear();
}

/** Whether the workspace has a Phaseo internal admin (owner or member with users.role 'admin'). Cached 10 minutes per isolate; a failed read is a no. */
export async function workFilingEnabled(db: Db, workspaceId: string, now = Date.now()): Promise<boolean> {
	const cached = gateCache.get(workspaceId);
	if (cached && cached.expiresAt > now) return cached.enabled;
	let enabled = false;
	try {
		const [owners, members] = await Promise.all([
			db.select<{ owner_user_id: string | null }>("workspaces", { select: "owner_user_id", id: `eq.${workspaceId}`, limit: "1" }),
			db.select<{ user_id: string }>("workspace_members", { select: "user_id", workspace_id: `eq.${workspaceId}`, limit: "500" }),
		]);
		const ids = [...new Set([...owners.map((row) => row.owner_user_id), ...members.map((row) => row.user_id)].filter((id): id is string => typeof id === "string" && id.length > 0))];
		if (ids.length) {
			const admins = await db.select("users", { select: "user_id", user_id: quoted(ids), role: "eq.admin", limit: "1" });
			enabled = admins.length > 0;
		}
	} catch {
		enabled = false;
	}
	if (gateCache.size >= GATE_CACHE_LIMIT) gateCache.delete(gateCache.keys().next().value!);
	gateCache.set(workspaceId, { enabled, expiresAt: now + GATE_TTL_MS });
	return enabled;
}

export type WorkToolContext = {
	env: Pick<Env, "SLACK_STATE_SECRET" | "PHASEO_WEB_ORIGIN" | "ENV">;
	installationId: string;
	channel: string;
	threadTs: string;
	slackUserId: string;
	/** The thread's permalink, or null when Slack can't give one. */
	permalink: () => Promise<string | null>;
	notes: string[];
	searched: SearchedThisAnswer;
	now: () => number;
	fetchImpl?: typeof fetch;
};

type FileInput = { title?: unknown; description?: unknown; kind?: unknown; customer?: unknown };

function text(value: unknown, max: number): string {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function fileWorkItemTool(context: WorkToolContext): AgentTool<any, any> {
	return {
		id: FILE_WORK_ITEM_TOOL_ID,
		description: [
			"File work into this Phaseo workspace's work tracker from this Slack thread. Use it only when someone asks you to file, log or track something (for example \"file this as a work item\" or \"log this ask for Acme\").",
			"kind \"item\": a bug, task or idea from the team; the description is what needs doing, with the useful details from the thread.",
			"kind \"ask\": a customer's request; set customer to the customer's company name if known, and put the customer's request in their own words in the description. It is kept private to the team and never copied into public issues, so the title should be neutral (no names or contact details).",
			"The item is linked to this thread and the triage agent sorts it. Tell the person the item number and link it returns.",
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: "A short title, at most 300 characters." },
				description: { type: "string", description: "The details. For an ask, the customer's request." },
				kind: { type: "string", enum: ["item", "ask"] },
				customer: { type: "string", description: "For an ask: the customer's company name, if known." },
			},
			required: ["title", "description", "kind"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: FileInput) => {
			const refused = await savingRefusal(context.searched);
			if (refused) return { filed: false, note: refused };
			const title = text(input.title, MAX_TITLE).replace(/\s+/g, " ");
			const description = text(input.description, MAX_DESCRIPTION);
			const kind = input.kind === "ask" ? "ask" : "item";
			const customer = text(input.customer, MAX_CUSTOMER);
			if (!title) return { filed: false, note: "A title is needed." };
			if (kind === "ask" && !description) return { filed: false, note: "An ask needs the customer's request as its description." };
			const secret = context.env.SLACK_STATE_SECRET?.trim();
			if (!secret) return { filed: false, note: "Filing work isn't set up here." };
			const body = JSON.stringify({
				installationId: context.installationId,
				slackUserId: context.slackUserId,
				channel: context.channel,
				threadTs: context.threadTs,
				permalink: await context.permalink().catch(() => null),
				title,
				description,
				kind,
				...(customer ? { customer } : {}),
			});
			const timestamp = Math.floor(context.now() / 1000);
			let response: Response;
			try {
				response = await (context.fetchImpl ?? fetch)(new URL("/api/internal/work/slack/items", webOrigin(context.env)).toString(), {
					method: "POST",
					headers: { "content-type": "application/json", "x-phaseo-timestamp": String(timestamp), "x-phaseo-signature": await signWorkRequest(secret, timestamp, body) },
					body,
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
			} catch {
				return { filed: false, note: "Phaseo didn't answer. Nothing was filed; they can ask again in a moment." };
			}
			const result = await response.json().catch(() => null) as { item?: { number?: number; url?: string }; customerMatched?: boolean; error?: string } | null;
			if (response.status === 403) return { filed: false, note: "Filing work from Slack isn't available for this workspace." };
			if (!response.ok || typeof result?.item?.number !== "number") return { filed: false, note: "Phaseo couldn't file it. Nothing was filed; they can try again." };
			context.notes.push(`filed work item #${result.item.number} (${kind})`);
			return {
				filed: true,
				number: result.item.number,
				url: result.item.url ?? null,
				...(kind === "ask" && customer ? { customerMatched: result.customerMatched === true } : {}),
				note: kind === "ask" && customer && result.customerMatched !== true ? "No customer with that name exists in Phaseo yet; the ask was filed without one." : undefined,
			};
		},
	};
}

/**
 * file_work_item for a turn, when it applies: not in a scheduled run, not for someone from another
 * organisation, with the shared secret set, and only for workspaces with an internal admin.
 */
export async function turnWorkTools(
	deps: { env: Env; db: Db; now: () => number },
	turn: Pick<TurnRef, "channel" | "threadTs" | "slackUserId" | "external" | "schedule">,
	installation: Pick<Installation, "id" | "workspace_id">,
	slack: SlackClient,
	notes: string[],
	searched: SearchedThisAnswer,
): Promise<AgentTool<any, any>[]> {
	if (turn.external || turn.schedule || !deps.env.SLACK_STATE_SECRET?.trim()) return [];
	if (!(await workFilingEnabled(deps.db, installation.workspace_id, deps.now()))) return [];
	return [fileWorkItemTool({
		env: deps.env,
		installationId: installation.id,
		channel: turn.channel,
		threadTs: turn.threadTs,
		slackUserId: turn.slackUserId,
		notes,
		searched,
		now: deps.now,
		permalink: async () => {
			const result = await slack.call<{ permalink?: string }>("chat.getPermalink", { channel: turn.channel, message_ts: turn.threadTs }, { form: true });
			return result.ok && typeof result.data.permalink === "string" ? result.data.permalink : null;
		},
	})];
}
