import { buildWebhookSignatureHeaders, decryptWebhookSecret, validateWebhookEndpointUrlForDelivery } from "@/core/webhook-endpoints";
import { sendEmail } from "@/lib/email/resend";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { getEmailSuppressionReason } from "@/pipeline/notifications/email-suppressions";
import { getModelDeprecationContent, getModelDeprecationTemplateVariables, renderModelDeprecationEmail, renderNotificationTestEmail } from "@/pipeline/notifications/model-deprecation";
import { getModelSubstitutionContent, renderModelSubstitutionEmail } from "@/pipeline/notifications/model-substitution";

const DELIVERABLE_KINDS = ["low_balance", "auto_top_up_failed", "payment_method_expiring", "model_deprecation", "model_substitution", "rate_limit_throttled", "broadcast_destination_failing", "notification_test"];
const EVENT_PAGE_SIZE = 100;
const MAX_ROUTING_PASSES = 20;
// Kept below PostgREST's 1,000-row response cap; the RPC also clamps it.
const MODEL_DEPRECATION_TARGET_PAGE_SIZE = 500;
const MODEL_DEPRECATION_USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DELIVERY_TIMEOUT_MS = 60_000;
const SAMPLE_DEPRECATION_LEAD_TIME_MS = 7 * 24 * 60 * 60 * 1000;
export type NotificationTestKind = "notification_test" | "model_deprecation";

function configuredModelDeprecationTemplateId(): string {
	try {
		return getBindings().RESEND_TEMPLATE_MODEL_DEPRECATION_ID?.trim() ?? "";
	} catch {
		return "";
	}
}

// A workspace hears about a deprecation once, as soon as the model is marked: a
// deprecated or retired status, or an announced deprecation or retirement date.
export function shouldNotifyModelDeprecation(model: { status?: unknown; deprecated_at?: unknown; retired_at?: unknown }): boolean {
	const status = String(model.status ?? "").toLowerCase();
	return status === "deprecated" || status === "retired" || Boolean(model.deprecated_at) || Boolean(model.retired_at);
}

type EventRow = { id: string; kind: string; subject: string | null; workspace_id: string; payload: Record<string, unknown> | null; created_at: string };
type DestinationRow = { id: string; workspace_id: string; name: string; type: string; target_ciphertext: string; target_iv: string; target_key_version: string; status: string; is_ephemeral?: boolean; signing_secret_ciphertext?: string | null; signing_secret_iv?: string | null; signing_secret_key_version?: string | null };
const DESTINATION_COLUMNS = "id,workspace_id,name,type,target_ciphertext,target_iv,target_key_version,status,is_ephemeral,signing_secret_ciphertext,signing_secret_iv,signing_secret_key_version";
type ClaimedAttemptRow = { id: string; event_id: string; destination_id: string; attempts: number; claim_token: string };

export async function forEachPage<T>(pageSize: number, fetchPage: (from: number, to: number) => Promise<T[]>, visit: (row: T) => Promise<void>): Promise<number> {
	let count = 0;
	for (let from = 0; ; from += pageSize) {
		const rows = await fetchPage(from, from + pageSize - 1);
		for (const row of rows) await visit(row);
		count += rows.length;
		if (rows.length < pageSize) return count;
	}
}

function rateLimitThrottledMessage(payload: Record<string, unknown>): string {
	const total = Number(payload.throttled_requests ?? 0);
	const minutes = Number(payload.window_minutes ?? 15);
	const policies = (Array.isArray(payload.policies) ? payload.policies : []) as Array<Record<string, unknown>>;
	const top = policies.slice(0, 5).map((policy) => `${String(policy.policy_name ?? "Deleted policy")} (${String(policy.limit_scope ?? "unknown").replaceAll("_", " ")} limit, ${Number(policy.throttled_requests ?? 0)})`);
	return `Rate limit policies rejected ${total} ${total === 1 ? "request" : "requests"} in the last ${minutes} minutes.${top.length ? ` Most rejected: ${top.join(", ")}.` : ""}`;
}

// Destination names and vendor error text go to Slack, Discord and Teams, where
// angle brackets can form mentions and links, so they are dropped.
function plainText(value: unknown, max: number): string {
	const text = String(value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
	return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function broadcastDestinationFailingMessage(payload: Record<string, unknown>): string {
	const total = Number(payload.failing_destinations ?? 0);
	const destinations = (Array.isArray(payload.destinations) ? payload.destinations : []) as Array<Record<string, unknown>>;
	const details = destinations.slice(0, 5).map((destination) => {
		const failures = Number(destination.consecutive_failures ?? 0);
		const error = plainText(destination.last_error, 200);
		return ` ${plainText(destination.name, 100) || "Unnamed destination"}: ${failures} ${failures === 1 ? "request" : "requests"} failed in a row${error ? ` (${error})` : ""}.`;
	});
	const more = total > details.length ? ` ${total - details.length} more failing.` : "";
	return `Broadcast could not deliver traces to ${total} ${total === 1 ? "destination" : "destinations"}.${details.join("")}${more}`;
}

export function eventContent(event: EventRow) {
	if (event.kind === "model_deprecation") {
		const content = getModelDeprecationContent(event.payload ?? {});
		return { title: content.title, message: content.message, settingsUrl: content.settingsUrl };
	}
	if (event.kind === "model_substitution") {
		const content = getModelSubstitutionContent(event.payload ?? {});
		return { title: content.title, message: content.message, settingsUrl: content.settingsUrl };
	}
	const payload = event.payload ?? {};
	const title = String(payload.title ?? event.subject ?? ({ low_balance: "Low balance alert", auto_top_up_failed: "Auto Top-Up failed", payment_method_expiring: "Payment method expiring soon", model_deprecation: "Model deprecation alert", rate_limit_throttled: "Rate limit alert", broadcast_destination_failing: "Broadcast destination failing", notification_test: "Phaseo test notification" } as Record<string, string>)[event.kind] ?? "Phaseo notification");
	let message = String(payload.message ?? "");
	if (!message && event.kind === "low_balance") message = `Your workspace balance is $${Number(payload.balance_usd ?? 0).toFixed(2)}, at or below the configured $${Number(payload.threshold_usd ?? 0).toFixed(2)} threshold.`;
	if (!message && event.kind === "auto_top_up_failed") message = String(payload.reason ?? "Phaseo could not automatically add credits to your workspace.");
	if (!message && event.kind === "payment_method_expiring") message = `The ${String(payload.brand ?? "card")} ending in ${String(payload.last4 ?? "unknown")} expires ${String(payload.expiry ?? "soon")}.`;
	if (!message && event.kind === "model_deprecation") message = `${String(payload.model_name ?? payload.model_id ?? "A model used by your workspace")} has been deprecated${payload.retirement_date ? ` and is scheduled to retire on ${String(payload.retirement_date)}` : ""}.`;
	if (!message && event.kind === "rate_limit_throttled") message = rateLimitThrottledMessage(payload);
	if (!message && event.kind === "broadcast_destination_failing") message = broadcastDestinationFailingMessage(payload);
	const settingsUrl = event.kind === "broadcast_destination_failing" ? "https://phaseo.app/settings/broadcast" : "https://phaseo.app/settings/notifications";
	return { title, message: message || "A workspace notification was generated.", settingsUrl };
}

export function buildProviderRequest(type: string, target: string, content: ReturnType<typeof eventContent>, event: EventRow): { url: string; body: unknown; headers?: Record<string, string> } {
	if (type === "discord") { const config = JSON.parse(target) as { channelId: string; botToken: string; userIds?: string[]; roleIds?: string[] }; const userIds = config.userIds ?? []; const roleIds = config.roleIds ?? []; const mentions = [...userIds.map((id) => `<@${id}>`), ...roleIds.map((id) => `<@&${id}>`)].join(" "); return { url: `https://discord.com/api/v10/channels/${encodeURIComponent(config.channelId)}/messages`, body: { content: `${mentions ? `${mentions}\n` : ""}**${content.title}**\n${content.message}\n${content.settingsUrl}`, allowed_mentions: { parse: [], users: userIds, roles: roleIds } }, headers: { authorization: `Bot ${config.botToken}` } }; }
	if (type === "discord_webhook") { let config: { url: string; userIds?: string[]; roleIds?: string[] }; try { config = JSON.parse(target) as typeof config; } catch { config = { url: target }; } const userIds = config.userIds ?? []; const roleIds = config.roleIds ?? []; const mentions = [...userIds.map((id) => `<@${id}>`), ...roleIds.map((id) => `<@&${id}>`)].join(" "); return { url: config.url, body: { content: `${mentions ? `${mentions}\n` : ""}**${content.title}**\n${content.message}`, allowed_mentions: { parse: [], users: userIds, roles: roleIds }, embeds: [{ title: content.title, description: content.message, url: content.settingsUrl, color: 5793266 }] } }; }
	if (type === "slack") { let config: { url: string; userIds?: string[]; userGroupIds?: string[] }; try { config = JSON.parse(target) as typeof config; } catch { config = { url: target }; } const mentions = [...(config.userIds ?? []).map((id) => `<@${id}>`), ...(config.userGroupIds ?? []).map((id) => `<!subteam^${id}>`)].join(" "); return { url: config.url, body: { text: `${mentions ? `${mentions} ` : ""}${content.title}: ${content.message}`, blocks: [{ type: "header", text: { type: "plain_text", text: content.title } }, ...(mentions ? [{ type: "section", text: { type: "mrkdwn", text: mentions } }] : []), { type: "section", text: { type: "mrkdwn", text: content.message } }, { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Manage notifications" }, url: content.settingsUrl }] }] } }; }
	if (type === "microsoft_teams") { let config: { url: string; mentionIds?: string[] }; try { config = JSON.parse(target) as typeof config; } catch { config = { url: target }; } const mentionIds = config.mentionIds ?? []; const mentionText = mentionIds.map((id) => `<at>${id}</at>`).join(" "); const entities = mentionIds.map((id) => ({ type: "mention", text: `<at>${id}</at>`, mentioned: { id, name: id } })); return { url: config.url, body: { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", weight: "Bolder", size: "Medium", text: content.title }, ...(mentionText ? [{ type: "TextBlock", wrap: true, text: mentionText }] : []), { type: "TextBlock", wrap: true, text: content.message }], actions: [{ type: "Action.OpenUrl", title: "Manage notifications", url: content.settingsUrl }], ...(entities.length ? { msteams: { entities } } : {}) } }] } }; }
	return { url: target, body: { id: event.id, type: event.kind, createdAt: event.created_at, workspaceId: event.workspace_id, data: { ...event.payload, title: content.title, message: content.message } }, headers: { "x-phaseo-event-id": event.id, "x-phaseo-event-type": event.kind } };
}

async function decryptTarget(destination: DestinationRow): Promise<string> {
	return decryptWebhookSecret({ secretCiphertext: destination.target_ciphertext, secretIv: destination.target_iv, secretKeyVersion: destination.target_key_version });
}

// Custom webhooks are signed when the destination has a signing secret. Destinations
// created before signing existed have none and keep sending unsigned until an admin
// generates one. A stored secret that cannot be decrypted fails the attempt (and is
// retried) rather than silently sending unsigned to a receiver that verifies.
export async function resolveDestinationSigningSecret(destination: Pick<DestinationRow, "type" | "signing_secret_ciphertext" | "signing_secret_iv" | "signing_secret_key_version">): Promise<string | null> {
	if (destination.type !== "custom_webhook" || !destination.signing_secret_ciphertext || !destination.signing_secret_iv) return null;
	try {
		return await decryptWebhookSecret({ secretCiphertext: destination.signing_secret_ciphertext, secretIv: destination.signing_secret_iv, secretKeyVersion: destination.signing_secret_key_version });
	} catch {
		throw new Error("notification_signing_secret_unavailable");
	}
}

async function postJson(url: string, body: unknown, headers?: Record<string, string>, signal?: AbortSignal, signingSecret?: string | null): Promise<number> {
	const bodyText = JSON.stringify(body);
	const signatureHeaders = signingSecret ? await buildWebhookSignatureHeaders(signingSecret, bodyText) : {};
	const validated = await validateWebhookEndpointUrlForDelivery(url);
	if (!validated.ok) throw new Error("reason" in validated ? validated.reason : "webhook_url_invalid");
	const response = await fetch(validated.url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Phaseo-Notifications/1.0", ...headers, ...signatureHeaders }, body: bodyText, redirect: "manual", signal });
	if (!response.ok) {
		const hostname = new URL(validated.url).hostname.toLowerCase();
		const isDiscordWebhook = (hostname === "discord.com" || hostname === "discordapp.com") && new URL(validated.url).pathname.startsWith("/api/webhooks/");
		const providerError = await response.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
		const providerCode = typeof providerError?.code === "number" || typeof providerError?.code === "string" ? String(providerError.code) : null;
		if (isDiscordWebhook && response.status === 404) throw new Error(`Discord webhook not found${providerCode ? ` (Discord code ${providerCode})` : ""}. Check that the complete webhook URL was copied after saving it in Discord.`);
		if (hostname === "discord.com" && response.status === 401) throw new Error("Discord rejected the bot token.");
		if (hostname === "discord.com" && response.status === 404) throw new Error("Discord channel not found, or the bot cannot access it.");
		if (hostname === "hooks.slack.com" && response.status === 404) throw new Error("Slack webhook not found. It may have been removed or rotated.");
		throw new Error(`Destination returned HTTP ${response.status}.`);
	}
	return response.status;
}

async function deliver(event: EventRow, destination: DestinationRow): Promise<number> {
	const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MS);
	const target = await decryptTarget(destination);
	const content = eventContent(event);
	if (destination.type === "email") {
		const modelDeprecationEmail = event.kind === "model_deprecation" ? renderModelDeprecationEmail(event.payload ?? {}) : null;
		const notificationTestEmail = event.kind === "notification_test" ? renderNotificationTestEmail() : event.kind === "model_substitution" ? renderModelSubstitutionEmail(event.payload ?? {}) : null;
		const modelDeprecationTemplateId = event.kind === "model_deprecation" ? configuredModelDeprecationTemplateId() : "";
		if (event.kind === "model_deprecation") console.log("model_deprecation_template", { configured: Boolean(modelDeprecationTemplateId) });
		let recipients: string[];
		try { const parsed = JSON.parse(target); recipients = Array.isArray(parsed) ? parsed.map(String) : [target]; } catch { recipients = [target]; }
		let delivered = 0;
		for (const [index, recipient] of recipients.entries()) {
			if (await getEmailSuppressionReason(recipient)) continue;
			await sendEmail({
				to: recipient,
				subject: modelDeprecationEmail?.subject ?? notificationTestEmail?.subject ?? content.title,
				...(modelDeprecationTemplateId
					? { template: { id: modelDeprecationTemplateId, variables: getModelDeprecationTemplateVariables(event.payload ?? {}) } }
					: { text: modelDeprecationEmail?.text ?? notificationTestEmail?.text ?? `${content.title}\n\n${content.message}\n\nManage notifications: ${content.settingsUrl}`, html: modelDeprecationEmail?.html ?? notificationTestEmail?.html ?? `<div style="font-family:ui-sans-serif,system-ui;line-height:1.5"><h2>${content.title.replaceAll("<", "&lt;")}</h2><p>${content.message.replaceAll("<", "&lt;")}</p><p><a href="${content.settingsUrl}">Manage notifications</a></p></div>` }),
				idempotencyKey: `notification:${event.id}:${destination.id}:${index}`,
				signal,
			});
			delivered += 1;
		}
		if (delivered === 0) return 208;
		return 202;
	}
	const request = buildProviderRequest(destination.type, target, content, event);
	return postJson(request.url, request.body, request.headers, signal, await resolveDestinationSigningSecret(destination));
}

export async function deliverNotificationTest(input: {
	type?: string;
	target?: string;
	destinationId?: string;
	workspaceId: string;
	kind?: NotificationTestKind;
}): Promise<number> {
	const kind = input.kind ?? "notification_test";
	const isModelDeprecationSample = kind === "model_deprecation";
	const event: EventRow = {
		id: crypto.randomUUID(),
		kind,
		subject: isModelDeprecationSample ? "Model deprecation: GPT 5.6 Sol" : "Phaseo test notification",
		workspace_id: input.workspaceId,
		payload: isModelDeprecationSample
			? {
				model_id: "openai/gpt-5.6-sol",
				model_name: "GPT 5.6 Sol",
				deprecation_date: new Date(Date.now() + SAMPLE_DEPRECATION_LEAD_TIME_MS).toISOString(),
				retirement_date: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString(),
				replacement_model_id: "openai/gpt-5.6-terra",
				replacement_model_name: "GPT 5.6 Terra",
			}
			: {
				title: "Phaseo test notification",
				message: "Your notification destination is connected and ready.",
			},
		created_at: new Date().toISOString(),
	};

	if (input.destinationId) {
		const result = await getSupabaseAdmin()
			.from("notification_destinations")
			.select(DESTINATION_COLUMNS)
			.eq("id", input.destinationId)
			.eq("workspace_id", input.workspaceId)
			.eq("status", "active")
			.maybeSingle();
		if (result.error || !result.data) throw new Error("notification_destination_not_found");
		return deliver(event, result.data as DestinationRow);
	}

	if (!input.type || !input.target) throw new Error("notification_test_target_missing");
	const content = eventContent(event);
	const modelDeprecationEmail = isModelDeprecationSample ? renderModelDeprecationEmail(event.payload ?? {}) : null;
	const notificationTestEmail = kind === "notification_test" ? renderNotificationTestEmail() : null;
	const modelDeprecationTemplateId = isModelDeprecationSample ? configuredModelDeprecationTemplateId() : "";
	if (input.type === "email") {
		let recipients: string[];
		try { const parsed = JSON.parse(input.target); recipients = Array.isArray(parsed) ? parsed.map(String) : [input.target]; } catch { recipients = [input.target]; }
		let delivered = 0;
		for (const [index, recipient] of recipients.entries()) {
			if (await getEmailSuppressionReason(recipient)) continue;
			await sendEmail({
				to: recipient,
				subject: modelDeprecationEmail?.subject ?? notificationTestEmail?.subject ?? content.title,
				...(modelDeprecationTemplateId
					? { template: { id: modelDeprecationTemplateId, variables: getModelDeprecationTemplateVariables(event.payload ?? {}) } }
					: { text: modelDeprecationEmail?.text ?? notificationTestEmail?.text ?? `${content.title}\n\n${content.message}\n\nManage notifications: ${content.settingsUrl}`, html: modelDeprecationEmail?.html ?? notificationTestEmail?.html ?? `<div style="font-family:ui-sans-serif,system-ui;line-height:1.5"><h2>${content.title}</h2><p>${content.message}</p><p><a href="${content.settingsUrl}">Manage notifications</a></p></div>` }),
				idempotencyKey: `notification-test:${event.id}:${index}`,
			});
			delivered += 1;
		}
		if (delivered === 0) throw new Error("email_recipient_suppressed");
		return 202;
	}
	const request = buildProviderRequest(input.type, input.target, content, event);
	return postJson(request.url, request.body, request.headers);
}

export async function runNotificationDeliveryJob(limit = 25): Promise<{ queued: number; sent: number; failed: number }> {
	const supabase = getSupabaseAdmin();
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	let queued = 0;
	// Only events without a routing snapshot are read. Routing an event removes it from that set,
	// so each pass reads from the start rather than paging by offset.
	for (let pass = 0; pass < MAX_ROUTING_PASSES; pass += 1) {
		const eventsResult = await supabase.from("email_outbox").select("id,kind,subject,workspace_id,payload,created_at,notification_routed_events(event_id)").in("kind", DELIVERABLE_KINDS).not("workspace_id", "is", null).gte("created_at", since).is("notification_routed_events", null).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(EVENT_PAGE_SIZE);
		if (eventsResult.error) throw new Error(`notification_events_fetch_failed:${eventsResult.error.message}`);
		const events = (eventsResult.data ?? []) as unknown as EventRow[];
		for (const event of events) {
			const requestedDestinationId = event.kind === "notification_test" && typeof event.payload?.destination_id === "string" ? event.payload.destination_id : null;
			const snapshot = await supabase.rpc("enqueue_notification_event_deliveries", { p_event_id: event.id, p_workspace_id: event.workspace_id, p_event_kind: event.kind, p_requested_destination_id: requestedDestinationId });
			if (snapshot.error) throw new Error(`notification_attempts_enqueue_failed:${snapshot.error.message}`);
			queued += Number(snapshot.data ?? 0);
		}
		if (events.length < EVENT_PAGE_SIZE) break;
	}
	const attempts = await supabase.rpc("claim_notification_delivery_attempts", { p_limit: limit });
	if (attempts.error) throw new Error(`notification_attempts_claim_failed:${attempts.error.message}`);
	let sent = 0; let failed = 0;
	for (const attempt of (attempts.data ?? []) as ClaimedAttemptRow[]) {
		try {
			const [eventResult, destinationResult] = await Promise.all([
				supabase.from("email_outbox").select("id,kind,subject,workspace_id,payload,created_at").eq("id", attempt.event_id).single(),
				supabase.from("notification_destinations").select(DESTINATION_COLUMNS).eq("id", attempt.destination_id).eq("status", "active").single(),
			]);
			if (eventResult.error || destinationResult.error) throw new Error("notification_delivery_source_missing");
			const responseStatus = await deliver(eventResult.data as EventRow, destinationResult.data as DestinationRow);
			const completion = await supabase.from("notification_delivery_attempts").update({ status: "sent", attempts: Number(attempt.attempts ?? 0) + 1, response_status: responseStatus, last_error: null, sent_at: new Date().toISOString(), claim_token: null, claimed_at: null, updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("claim_token", attempt.claim_token).eq("status", "processing").select("id").maybeSingle();
			if (completion.error) throw new Error(`notification_attempt_completion_failed:${completion.error.message}`);
			if (!completion.data) continue;
			if ((destinationResult.data as DestinationRow).is_ephemeral) await supabase.from("notification_destinations").update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", attempt.destination_id);
			sent += 1;
		} catch (error) {
			const attemptsCount = Number(attempt.attempts ?? 0) + 1;
			const terminal = attemptsCount >= 5;
			const retry = await supabase.from("notification_delivery_attempts").update({ status: terminal ? "failed" : "retry", attempts: attemptsCount, next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** attemptsCount) * 1000).toISOString(), last_error: String(error instanceof Error ? error.message : error).slice(0, 1000), claim_token: null, claimed_at: null, updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("claim_token", attempt.claim_token).eq("status", "processing").select("id").maybeSingle();
			if (retry.error || !retry.data) continue;
			if (terminal) await supabase.from("notification_destinations").update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", attempt.destination_id).eq("is_ephemeral", true);
			failed += 1;
		}
	}
	return { queued, sent, failed };
}

type DeprecatedModelRow = { model_slug: string; name: string | null; status: string | null; deprecated_at: string | null; retired_at: string | null; replacement_model_slug: string | null };

type ModelDeprecationAlertTarget = { workspace_id: string; model_slugs: string[] | null; include_admins: boolean | null };

export async function enqueueModelDeprecationNotifications(now = new Date()): Promise<{ workspaces: number; enqueued: number }> {
	const supabase = getSupabaseAdmin();
	const modelsResult = await supabase.from("v2_models").select("model_slug,name,status,deprecated_at,retired_at,replacement_model_slug").or("status.in.(deprecated,retired),deprecated_at.not.is.null,retired_at.not.is.null");
	if (modelsResult.error) throw new Error(`model_deprecation_models_fetch_failed:${modelsResult.error.message}`);
	const models = new Map<string, DeprecatedModelRow>();
	for (const model of (modelsResult.data ?? []) as DeprecatedModelRow[]) {
		if (model.model_slug && shouldNotifyModelDeprecation(model)) models.set(model.model_slug, model);
	}
	if (!models.size) return { workspaces: 0, enqueued: 0 };

	const replacementIds = [...new Set([...models.values()].map((model) => String(model.replacement_model_slug ?? "").trim()).filter(Boolean))];
	const replacementNames = new Map<string, string>();
	if (replacementIds.length) {
		const replacements = await supabase.from("v2_models").select("model_slug,name").in("model_slug", replacementIds);
		if (replacements.error) throw new Error(`model_deprecation_replacements_fetch_failed:${replacements.error.message}`);
		for (const replacement of replacements.data ?? []) {
			if (replacement.model_slug && replacement.name) replacementNames.set(String(replacement.model_slug), String(replacement.name));
		}
	}

	const emailCache = new Map<string, string>();
	const emailFor = async (userId: string): Promise<string> => {
		if (!emailCache.has(userId)) {
			const user = await (supabase as any).auth.admin.getUserById(userId);
			// A deleted user has no address; any other failure stops the run so the
			// next one retries it (the outbox dedupe keys make that safe).
			if (user?.error && user.error.status !== 404) throw new Error(`model_deprecation_user_fetch_failed:${user.error.message}`);
			emailCache.set(userId, String(user?.data?.user?.email ?? "").trim());
		}
		return emailCache.get(userId) ?? "";
	};

	let workspaces = 0;
	let enqueued = 0;
	const enqueueForWorkspace = async (workspaceId: string, includeAdmins: boolean, modelSlugs: string[]): Promise<void> => {
		const workspace = await supabase.from("workspaces").select("name,owner_user_id").eq("id", workspaceId).maybeSingle();
		if (workspace.error) throw new Error(`model_deprecation_workspace_fetch_failed:${workspace.error.message}`);
		const ownerUserId = workspace.data?.owner_user_id ? String(workspace.data.owner_user_id) : "";
		if (!ownerUserId) return;
		const recipientUserIds = [ownerUserId];
		if (includeAdmins) {
			const admins = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "admin");
			if (admins.error) throw new Error(`model_deprecation_admins_fetch_failed:${admins.error.message}`);
			for (const admin of admins.data ?? []) {
				const userId = String(admin.user_id ?? "");
				if (userId && !recipientUserIds.includes(userId)) recipientUserIds.push(userId);
			}
		}
		const recipients: Array<{ userId: string; email: string }> = [];
		for (const userId of recipientUserIds) {
			const email = await emailFor(userId);
			if (email) recipients.push({ userId, email });
		}
		const ownerEmail = recipients.find((recipient) => recipient.userId === ownerUserId)?.email;
		if (!ownerEmail) return;

		for (const modelSlug of modelSlugs) {
			const model = models.get(modelSlug);
			if (!model) continue;
			const replacementModelId = String(model.replacement_model_slug ?? "").trim() || null;
			const replacementModelName = replacementModelId ? replacementNames.get(replacementModelId) ?? null : null;
			const content = getModelDeprecationContent({
				model_id: model.model_slug,
				model_name: model.name ?? model.model_slug,
				deprecation_date: model.deprecated_at,
				retirement_date: model.retired_at,
				replacement_model_id: replacementModelId,
				replacement_model_name: replacementModelName,
			}, now);
			const payload = { workspace_name: workspace.data?.name ?? "your workspace", model_id: model.model_slug, model_name: model.name ?? model.model_slug, deprecation_date: model.deprecated_at, retirement_date: model.retired_at, replacement_model_id: replacementModelId, replacement_model_name: replacementModelName, title: content.title };
			// One notice per workspace and model, ever: a later date change does not resend it.
			const dedupeKey = `model_deprecation:${workspaceId}:${model.model_slug}`.slice(0, 450);
			// The model_deprecation row fans out to the workspace's routed destinations;
			// the model_deprecation_email rows are the owner (and admin) emails.
			const rows = [
				{ dedupe_key: dedupeKey, kind: "model_deprecation", template: "model_deprecation", to_email: ownerEmail, subject: content.title, workspace_id: workspaceId, user_id: ownerUserId, payload },
				...recipients.map((recipient) => ({ dedupe_key: `${dedupeKey}:email:${recipient.userId}`, kind: "model_deprecation_email", template: "model_deprecation", to_email: recipient.email, subject: content.title, workspace_id: workspaceId, user_id: recipient.userId, payload })),
			];
			const inserted = await supabase.from("email_outbox").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("dedupe_key");
			if (inserted.error) throw new Error(`model_deprecation_enqueue_failed:${inserted.error.message}`);
			if ((inserted.data ?? []).some((row) => row.dedupe_key === dedupeKey)) enqueued += 1;
		}
	};

	// The database starts from the deprecated models (a narrow index scan), keeps
	// only alert-enabled workspaces, and returns one row per workspace. Page by
	// workspace_id so no enabled workspace is cut off by the response cap.
	const since = new Date(now.getTime() - MODEL_DEPRECATION_USAGE_WINDOW_MS).toISOString();
	let afterWorkspaceId: string | null = null;
	for (;;) {
		const page = await supabase.rpc("get_model_deprecation_alert_targets", {
			p_model_slugs: [...models.keys()],
			p_since: since,
			p_after_workspace_id: afterWorkspaceId,
			p_limit: MODEL_DEPRECATION_TARGET_PAGE_SIZE,
		});
		if (page.error) throw new Error(`model_deprecation_targets_fetch_failed:${page.error.message}`);
		const targets = (page.data ?? []) as ModelDeprecationAlertTarget[];
		for (const target of targets) {
			if (!target.workspace_id) continue;
			const modelSlugs = (target.model_slugs ?? []).filter((slug) => models.has(slug));
			if (!modelSlugs.length) continue;
			workspaces += 1;
			await enqueueForWorkspace(String(target.workspace_id), target.include_admins === true, modelSlugs);
		}
		if (targets.length < MODEL_DEPRECATION_TARGET_PAGE_SIZE) break;
		const lastWorkspaceId = String(targets[targets.length - 1]?.workspace_id ?? "");
		if (!lastWorkspaceId || lastWorkspaceId === afterWorkspaceId) break;
		afterWorkspaceId = lastWorkspaceId;
	}
	return { workspaces, enqueued };
}
