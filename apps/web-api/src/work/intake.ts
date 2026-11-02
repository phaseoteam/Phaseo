// Public ask intake (POST /api/_web/work/asks/:token): a web form, support widget or email
// forwarder posts a customer's request. It is stored as a private work_customer_request, matched
// to a customer by email domain, and, when the form has auto-triage on, turned into a work item
// (source "ask") that the triage agent sorts in the background.
//
// Privacy: the request body and contact details stay in work_customer_requests. The work item
// gets the subject as its title (or a generic title) and an empty description, and its timeline
// event says only "Customer request from <customer name or 'a customer'>".

import type { Env } from "@/env";
import { addWorkItemEvent, createWorkItem, type DataClient } from "./items";
import { triageWorkItem } from "./triage";
import type { IntakeFormRow } from "./types";

export const MAX_ASK_BYTES = 64 * 1024;
const MAX_BODY_CHARS = 50_000;
const MAX_SUBJECT_CHARS = 300;
const MAX_NAME_CHARS = 200;
const MAX_EMAIL_CHARS = 320;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_VALUE_CHARS = 500;
const MAX_METADATA_JSON_CHARS = 8_000;
const MAX_REDIRECT_CHARS = 2_048;
const EMAIL_PATTERN = /^[^\s@<>"(),;:]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
// Form fields that are part of the ask itself; any other field goes into metadata.
const FORM_FIELDS = new Set(["subject", "body", "message", "name", "email", "redirect", "metadata"]);

export type ParsedAsk = {
	subject: string | null;
	body: string;
	name: string | null;
	email: string | null;
	metadata: Record<string, unknown>;
	/** A safe http(s) URL to send a form post to afterwards. */
	redirect: string | null;
};

export type AskParseResult = { ok: true; ask: ParsedAsk; isForm: boolean } | { ok: false; code: string; message: string };

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : null;
}

/** The email if it looks like one (lowercased domain), or null. Invalid emails are dropped, not rejected. */
export function normaliseEmail(value: unknown): string | null {
	const email = text(value, MAX_EMAIL_CHARS);
	if (!email) return null;
	const match = EMAIL_PATTERN.exec(email);
	if (!match) return null;
	return `${email.slice(0, email.length - match[1].length)}${match[1].toLowerCase()}`;
}

/** The lowercased domain of an email, or null. */
export function emailDomain(email: string | null | undefined): string | null {
	if (!email) return null;
	const match = EMAIL_PATTERN.exec(email);
	return match ? match[1].toLowerCase() : null;
}

/**
 * The redirect target for a form post: absolute http(s) URLs only, without credentials or
 * control characters. Anything else (javascript:, data:, relative paths, "//host") gives null.
 */
export function safeRedirectUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	if (!raw || raw.length > MAX_REDIRECT_CHARS) return null;
	if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
	if (!/^https?:\/\//i.test(raw)) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.username || url.password || !url.hostname) return null;
	return url.toString();
}

function cleanMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_KEYS);
	const result: Record<string, unknown> = {};
	for (const [key, entry] of entries) {
		const name = key.slice(0, 100);
		if (typeof entry === "string") result[name] = entry.slice(0, MAX_METADATA_VALUE_CHARS);
		else if (typeof entry === "number" || typeof entry === "boolean" || entry === null) result[name] = entry;
		else {
			const json = JSON.stringify(entry);
			if (json && json.length <= MAX_METADATA_VALUE_CHARS * 4) result[name] = entry;
		}
	}
	return JSON.stringify(result).length <= MAX_METADATA_JSON_CHARS ? result : {};
}

/** Builds an ask from a JSON object or form fields. */
export function askFromFields(fields: Record<string, unknown>, metadata: Record<string, unknown>): AskParseResult {
	const body = text(fields.body, MAX_BODY_CHARS) ?? text(fields.message, MAX_BODY_CHARS);
	if (!body) return { ok: false, code: "body_required", message: "The request needs a body" };
	return {
		ok: true,
		isForm: false,
		ask: {
			subject: text(fields.subject, MAX_SUBJECT_CHARS),
			body,
			name: text(fields.name, MAX_NAME_CHARS),
			email: normaliseEmail(fields.email),
			metadata: cleanMetadata(metadata),
			redirect: safeRedirectUrl(fields.redirect),
		},
	};
}

/**
 * Parses an ask from the raw request body. JSON (application/json, or text/plain holding JSON)
 * and HTML form posts (urlencoded or multipart) are accepted. Form fields other than the known
 * ones are kept as metadata.
 */
export async function parseAskRequest(contentType: string | null, rawBody: string): Promise<AskParseResult> {
	const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
	if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
		const pairs: Array<[string, unknown]> = [];
		try {
			if (type === "multipart/form-data") {
				const form = await new Response(rawBody, { headers: { "content-type": contentType ?? "" } }).formData();
				form.forEach((value, key) => pairs.push([key, value]));
			} else {
				new URLSearchParams(rawBody).forEach((value, key) => pairs.push([key, value]));
			}
		} catch {
			return { ok: false, code: "invalid_body", message: "Could not read the form" };
		}
		const fields: Record<string, unknown> = {};
		const metadata: Record<string, unknown> = {};
		for (const [key, value] of pairs) {
			if (typeof value !== "string") continue; // files are ignored
			if (FORM_FIELDS.has(key)) fields[key] = value;
			else if (!key.startsWith("_") && Object.keys(metadata).length < MAX_METADATA_KEYS) metadata[key] = value;
		}
		const result = askFromFields(fields, metadata);
		return result.ok ? { ...result, isForm: true } : result;
	}
	if (type && type !== "application/json" && type !== "text/plain") {
		return { ok: false, code: "unsupported_media_type", message: "Send JSON or a form post" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return { ok: false, code: "invalid_json", message: "The body is not valid JSON" };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, code: "invalid_body", message: "The body must be a JSON object" };
	}
	const fields = parsed as Record<string, unknown>;
	return askFromFields(fields, (fields.metadata ?? {}) as Record<string, unknown>);
}

/** The work item title for an ask: its subject, or a generic title. Never the body. */
export function askItemTitle(ask: Pick<ParsedAsk, "subject">, formName: string): string {
	return ask.subject ?? `Customer request via ${formName}`.slice(0, 300);
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type IntakeForm = Pick<IntakeFormRow, "id" | "workspace_id" | "name" | "enabled" | "auto_triage">;

/** The enabled intake form for a token hash, or null. */
export async function loadIntakeForm(client: DataClient, tokenHash: string): Promise<IntakeForm | null> {
	const { data, error } = await client.from("work_intake_forms")
		.select("id,workspace_id,name,enabled,auto_triage")
		.eq("token_hash", tokenHash)
		.maybeSingle();
	if (error) throw new Error(`work_intake_forms read failed: ${error.message}`);
	const form = data as IntakeForm | null;
	return form?.enabled ? form : null;
}

/** The workspace's customer whose domain matches the email's domain, if any. */
export async function matchCustomerByEmail(client: DataClient, workspaceId: string, email: string | null): Promise<{ id: string; name: string } | null> {
	const domain = emailDomain(email);
	if (!domain) return null;
	const { data, error } = await client.from("work_customers")
		.select("id,name")
		.eq("workspace_id", workspaceId)
		.ilike("domain", escapeLike(domain))
		.limit(1)
		.maybeSingle();
	if (error) {
		console.error("[work] customer match failed", { message: error.message });
		return null;
	}
	return (data as { id: string; name: string } | null) ?? null;
}

/**
 * Stores an ask and, with auto-triage on, creates its work item and starts triage. Returns the
 * request id as the public reference.
 */
export async function recordAsk(args: {
	env: Env;
	client: DataClient;
	form: IntakeForm;
	ask: ParsedAsk;
	waitUntil: (promise: Promise<unknown>) => void;
}): Promise<{ reference: string; itemId: string | null }> {
	const { env, client, form, ask, waitUntil } = args;
	const customer = await matchCustomerByEmail(client, form.workspace_id, ask.email);
	const { data, error } = await client.from("work_customer_requests")
		.insert({
			workspace_id: form.workspace_id,
			customer_id: customer?.id ?? null,
			intake_form_id: form.id,
			source: "form",
			status: "new",
			contact_name: ask.name,
			contact_email: ask.email,
			subject: ask.subject,
			body: ask.body,
			metadata: ask.metadata,
		})
		.select("id")
		.single();
	if (error || !data) throw new Error(`work_customer_requests insert failed: ${error?.message ?? "no row"}`);
	const requestId = (data as { id: string }).id;

	waitUntil(Promise.resolve(
		client.from("work_intake_forms").update({ last_used_at: new Date().toISOString() }).eq("id", form.id),
	).catch(() => undefined));

	if (!form.auto_triage) return { reference: requestId, itemId: null };

	const item = await createWorkItem(client, {
		workspaceId: form.workspace_id,
		title: askItemTitle(ask, form.name),
		description: "",
		state: "triage",
		source: "ask",
		authorKind: "system",
	});
	const { error: linkError } = await client.from("work_customer_requests")
		.update({ work_item_id: item.id, status: "linked", updated_at: new Date().toISOString() })
		.eq("id", requestId);
	if (linkError) console.error("[work] ask link failed", { requestId, message: linkError.message });
	await addWorkItemEvent(client, {
		workspaceId: form.workspace_id,
		workItemId: item.id,
		kind: "customer_request",
		authorKind: "customer",
		body: `Customer request from ${customer?.name ?? "a customer"}`,
		data: { requestId, intakeFormId: form.id, ...(customer ? { customerId: customer.id } : {}) },
	}).catch((eventError) => console.error("[work] ask event failed", { itemId: item.id, message: String(eventError) }));

	waitUntil(
		triageWorkItem({ env, client, workspaceId: form.workspace_id, itemId: item.id, requestedBy: null, waitUntil })
			.then((result) => {
				if (!result.ok) console.warn("[work] ask triage skipped", { itemId: item.id, code: result.code });
			})
			.catch((triageError) => console.error("[work] ask triage failed", { itemId: item.id, message: String(triageError) })),
	);
	return { reference: requestId, itemId: item.id };
}
