import { Hono } from "hono";
import type { Env } from "@/env";
import {
	WORK_ITEM_COLUMNS,
	addWorkItemEvent,
	createWorkItem,
	formatCustomer,
	formatCustomerRequest,
	formatWorkItem,
	loadWorkItemByNumber,
	type DataClient,
} from "@/work/items";
import { stripPersonalData, triageWorkItem } from "@/work/triage";
import { CUSTOMER_REQUEST_STATUSES, type CustomerRequestRow, type CustomerRow, type WorkItemRow } from "@/work/types";
import type { AccountWorkspaceContext } from "./context";
import {
	accessFromQuery,
	backgroundRunner,
	badRequest,
	clampLimit,
	json,
	notFound,
	optionalText,
	pathUuid,
	readBody,
	unavailable,
	UUID_PATTERN,
	workAccess,
	type Body,
} from "./work-shared";

// Customers and their requests (asks) for the work tracker. Request bodies and contact details
// are private: they are returned to workspace members here and read by the triage agent, but are
// never copied into a work item's description, a timeline event or anything sent to GitHub.

const CUSTOMER_PAGE_SIZE = 50;
const REQUEST_SELECT = "*,customer:work_customers(name),item:work_items(number)";
const DOMAIN_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export const accountWorkCustomersRouter = new Hono<{ Bindings: Env }>();

/**
 * Request and open item counts for a page of customers: two count queries per customer (head
 * requests, counted in the database), never every row added up here.
 */
async function customerCounts(client: DataClient, workspaceId: string, ids: string[]) {
	const counts = new Map<string, { requestCount: number; openItemCount: number }>();
	await Promise.all(ids.map(async (id) => {
		const [requests, items] = await Promise.all([
			client.from("work_customer_requests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("customer_id", id),
			// Inner join: each open item counts once, however many of the customer's requests it has.
			client.from("work_items").select("id,work_customer_requests!inner(customer_id)", { count: "exact", head: true })
				.eq("workspace_id", workspaceId).eq("work_customer_requests.customer_id", id).not("state", "in", "(done,cancelled)"),
		]);
		counts.set(id, { requestCount: requests.count ?? 0, openItemCount: items.count ?? 0 });
	}));
	return counts;
}

function normalizeDomain(value: string | null | undefined): string | null | undefined {
	if (value == null) return value;
	return value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

type CustomerFields = { name?: string; domain?: string | null; external_ref?: string | null; tier?: string | null; notes?: string };

function parseCustomerFields(body: Body, creating: boolean): { ok: true; value: CustomerFields } | { ok: false; message: string } {
	const value: CustomerFields = {};
	const name = optionalText(body, "name", 200, { required: creating, nullable: false });
	if (name.ok === false) return name;
	if (name.value) value.name = name.value;
	const domain = optionalText(body, "domain", 253);
	if (domain.ok === false) return domain;
	if (domain.value !== undefined) {
		const normalized = normalizeDomain(domain.value);
		if (normalized && !DOMAIN_PATTERN.test(normalized)) return { ok: false, message: "domain must be a domain such as example.com" };
		value.domain = normalized ?? null;
	}
	const externalRef = optionalText(body, "externalRef", 200);
	if (externalRef.ok === false) return externalRef;
	if (externalRef.value !== undefined) value.external_ref = externalRef.value;
	const tier = optionalText(body, "tier", 50);
	if (tier.ok === false) return tier;
	if (tier.value !== undefined) value.tier = tier.value;
	const notes = optionalText(body, "notes", 10_000);
	if (notes.ok === false) return notes;
	if (notes.value !== undefined) value.notes = notes.value ?? "";
	return { ok: true, value };
}

function customerWriteError(c: any, error: { code?: string }) {
	if (error.code === "23505") return json(c, { error: "conflict", message: "Another customer already has this domain" }, 409);
	if (error.code === "23514") return badRequest(c, "The customer is not valid");
	return unavailable(c, "work_customer_write_failed");
}

accountWorkCustomersRouter.get("/customers", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const limit = clampLimit(c.req.query("limit"), CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE);
	const offset = Math.max(0, Math.min(100_000, Math.floor(Number(c.req.query("offset")) || 0)));
	let query = context.client.from("work_customers").select("*").eq("workspace_id", context.workspaceId);
	const q = c.req.query("q")?.trim().slice(0, 200);
	if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
	const { data, error } = await query.order("name", { ascending: true }).order("id", { ascending: true }).range(offset, offset + limit);
	if (error) return unavailable(c);
	const rows = (data ?? []) as CustomerRow[];
	const page = rows.slice(0, limit);
	const counts = await customerCounts(context.client, context.workspaceId, page.map((row) => row.id));
	return json(c, {
		customers: page.map((row) => formatCustomer(row, counts.get(row.id))),
		nextOffset: rows.length > limit ? offset + limit : null,
	});
});

accountWorkCustomersRouter.get("/customers/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A customer id is required");
	const customer = await context.client.from("work_customers").select("*").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (customer.error) return unavailable(c);
	if (!customer.data) return notFound(c, "Customer not found");
	const [requests, items, counts] = await Promise.all([
		context.client.from("work_customer_requests").select(REQUEST_SELECT).eq("workspace_id", context.workspaceId).eq("customer_id", id)
			.order("created_at", { ascending: false }).limit(100),
		context.client.from("work_items").select(`${WORK_ITEM_COLUMNS},work_customer_requests!inner(customer_id)`)
			.eq("workspace_id", context.workspaceId).eq("work_customer_requests.customer_id", id)
			.order("updated_at", { ascending: false }).limit(100),
		customerCounts(context.client, context.workspaceId, [id]),
	]);
	if (requests.error || items.error) return unavailable(c);
	return json(c, {
		customer: formatCustomer(customer.data as CustomerRow, counts.get(id)),
		requests: (requests.data ?? []).map((row: any) => formatCustomerRequest(row)),
		items: (items.data ?? []).map((row: any) => {
			const { work_customer_requests: _join, ...item } = row;
			return formatWorkItem(item as WorkItemRow);
		}),
	});
});

accountWorkCustomersRouter.post("/customers", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const fields = parseCustomerFields(body, true);
	if (fields.ok === false) return badRequest(c, fields.message);
	const { data, error } = await context.client.from("work_customers").insert({ ...fields.value, workspace_id: context.workspaceId }).select("*").maybeSingle();
	if (error || !data) return customerWriteError(c, error ?? {});
	return json(c, { customer: formatCustomer(data as CustomerRow) }, 201);
});

accountWorkCustomersRouter.patch("/customers/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A customer id is required");
	const fields = parseCustomerFields(body, false);
	if (fields.ok === false) return badRequest(c, fields.message);
	if (!Object.keys(fields.value).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_customers").update({ ...fields.value, updated_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("id", id).select("*").maybeSingle();
	if (error) return customerWriteError(c, error);
	if (!data) return notFound(c, "Customer not found");
	const counts = await customerCounts(context.client, context.workspaceId, [id]);
	return json(c, { customer: formatCustomer(data as CustomerRow, counts.get(id)) });
});

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

async function customerName(client: DataClient, workspaceId: string, customerId: string | null): Promise<string | null> {
	if (!customerId) return null;
	const { data } = await client.from("work_customers").select("name").eq("workspace_id", workspaceId).eq("id", customerId).maybeSingle();
	return typeof data?.name === "string" ? data.name : null;
}

async function customerExists(client: DataClient, workspaceId: string, customerId: string): Promise<boolean> {
	const { data } = await client.from("work_customers").select("id").eq("workspace_id", workspaceId).eq("id", customerId).maybeSingle();
	return Boolean(data);
}

/** The customer whose domain matches the email's, if any. */
async function customerForEmail(client: DataClient, workspaceId: string, email: string | null | undefined): Promise<string | null> {
	const domain = email ? EMAIL_PATTERN.exec(email)?.[1]?.toLowerCase() : null;
	if (!domain) return null;
	const { data } = await client.from("work_customers").select("id").eq("workspace_id", workspaceId).ilike("domain", domain.replace(/[\\%_]/g, (match) => `\\${match}`)).limit(1).maybeSingle();
	return data?.id ? String(data.id) : null;
}

/** The timeline event for a linked request. Only the customer's name, never the request itself. */
export async function recordRequestLink(client: DataClient, context: { workspaceId: string; userId: string | null }, itemId: string, request: Pick<CustomerRequestRow, "id" | "customer_id">) {
	const name = await customerName(client, context.workspaceId, request.customer_id);
	await addWorkItemEvent(client, {
		workspaceId: context.workspaceId,
		workItemId: itemId,
		kind: "customer_request",
		authorKind: context.userId ? "user" : "system",
		authorUserId: context.userId,
		body: `Customer request from ${name ?? "a customer"}`,
		data: { requestId: request.id, customerId: request.customer_id },
	});
}

async function loadRequest(context: AccountWorkspaceContext, id: string) {
	return context.client.from("work_customer_requests").select(REQUEST_SELECT).eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
}

accountWorkCustomersRouter.get("/requests", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	let query = context.client.from("work_customer_requests").select(REQUEST_SELECT).eq("workspace_id", context.workspaceId);
	const status = c.req.query("status")?.trim();
	if (status) {
		if (!(CUSTOMER_REQUEST_STATUSES as readonly string[]).includes(status)) return badRequest(c, "status must be new, linked or dismissed");
		query = query.eq("status", status);
	}
	const customerId = c.req.query("customerId")?.trim();
	if (customerId) {
		if (!UUID_PATTERN.test(customerId)) return badRequest(c, "customerId is not valid");
		query = query.eq("customer_id", customerId.toLowerCase());
	}
	const limit = clampLimit(c.req.query("limit"), 100, 200);
	const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
	if (error) return unavailable(c);
	return json(c, { requests: (data ?? []).map((row: any) => formatCustomerRequest(row)) });
});

accountWorkCustomersRouter.post("/requests", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const text = optionalText(body, "body", 50_000, { required: true });
	if (text.ok === false) return badRequest(c, text.message);
	const subject = optionalText(body, "subject", 300);
	if (subject.ok === false) return badRequest(c, subject.message);
	const contactName = optionalText(body, "contactName", 200);
	if (contactName.ok === false) return badRequest(c, contactName.message);
	const contactEmail = optionalText(body, "contactEmail", 320);
	if (contactEmail.ok === false) return badRequest(c, contactEmail.message);
	if (contactEmail.value && !EMAIL_PATTERN.test(contactEmail.value)) return badRequest(c, "contactEmail is not an email address");
	let customerId: string | null = null;
	if (body.customerId != null && body.customerId !== "") {
		if (typeof body.customerId !== "string" || !UUID_PATTERN.test(body.customerId)) return badRequest(c, "customerId is not valid");
		customerId = body.customerId.toLowerCase();
		if (!await customerExists(context.client, context.workspaceId, customerId)) return badRequest(c, "customerId must be a customer in this workspace");
	} else {
		customerId = await customerForEmail(context.client, context.workspaceId, contactEmail.value);
	}
	let item: WorkItemRow | null = null;
	if (body.workItemNumber != null) {
		if (typeof body.workItemNumber !== "number" || !Number.isInteger(body.workItemNumber)) return badRequest(c, "workItemNumber must be an item number");
		item = await loadWorkItemByNumber(context.client, context.workspaceId, body.workItemNumber).catch(() => null);
		if (!item) return badRequest(c, "workItemNumber must be an item in this workspace");
	}
	const { data, error } = await context.client.from("work_customer_requests").insert({
		workspace_id: context.workspaceId,
		customer_id: customerId,
		work_item_id: item?.id ?? null,
		source: "manual",
		status: item ? "linked" : "new",
		contact_name: contactName.value ?? null,
		contact_email: contactEmail.value ?? null,
		subject: subject.value ?? null,
		body: text.value!,
		created_by: context.user.id,
	}).select(REQUEST_SELECT).maybeSingle();
	if (error || !data) return unavailable(c, "work_request_write_failed");
	const row = data as unknown as CustomerRequestRow;
	if (item) await recordRequestLink(context.client, { workspaceId: context.workspaceId, userId: context.user.id }, item.id, row).catch(() => undefined);
	return json(c, { request: formatCustomerRequest(data as any) }, 201);
});

accountWorkCustomersRouter.patch("/requests/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A request id is required");
	const current = await loadRequest(context, id);
	if (current.error) return unavailable(c);
	if (!current.data) return notFound(c, "Request not found");
	const request = current.data as unknown as CustomerRequestRow;
	const patch: Record<string, unknown> = {};
	if (body.status !== undefined) {
		if (!(CUSTOMER_REQUEST_STATUSES as readonly unknown[]).includes(body.status)) return badRequest(c, "status must be new, linked or dismissed");
		patch.status = body.status;
	}
	if (body.customerId !== undefined) {
		if (body.customerId === null || body.customerId === "") patch.customer_id = null;
		else {
			if (typeof body.customerId !== "string" || !UUID_PATTERN.test(body.customerId)) return badRequest(c, "customerId is not valid");
			if (!await customerExists(context.client, context.workspaceId, body.customerId.toLowerCase())) return badRequest(c, "customerId must be a customer in this workspace");
			patch.customer_id = body.customerId.toLowerCase();
		}
	}
	let linkTo: WorkItemRow | null = null;
	if (body.workItemNumber !== undefined) {
		if (body.workItemNumber === null) {
			patch.work_item_id = null;
			if (patch.status === undefined && request.status === "linked") patch.status = "new";
		} else {
			if (typeof body.workItemNumber !== "number" || !Number.isInteger(body.workItemNumber)) return badRequest(c, "workItemNumber must be an item number");
			linkTo = await loadWorkItemByNumber(context.client, context.workspaceId, body.workItemNumber).catch(() => null);
			if (!linkTo) return badRequest(c, "workItemNumber must be an item in this workspace");
			patch.work_item_id = linkTo.id;
			patch.status = "linked";
		}
	}
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	patch.updated_at = new Date().toISOString();
	const { data, error } = await context.client.from("work_customer_requests").update(patch)
		.eq("workspace_id", context.workspaceId).eq("id", id).select(REQUEST_SELECT).maybeSingle();
	if (error || !data) return unavailable(c, "work_request_write_failed");
	const updated = data as unknown as CustomerRequestRow;
	if (linkTo && linkTo.id !== request.work_item_id) {
		await recordRequestLink(context.client, { workspaceId: context.workspaceId, userId: context.user.id }, linkTo.id, updated).catch(() => undefined);
	}
	return json(c, { request: formatCustomerRequest(data as any) });
});

/** A title for an item made from a request: its subject, else the start of the body, without contact details. */
export function requestItemTitle(request: Pick<CustomerRequestRow, "subject" | "body">): string {
	const source = request.subject?.trim() || request.body.trim().split(/\r?\n/)[0] || "";
	const cleaned = stripPersonalData(source).replace(/\s+/g, " ").trim();
	const title = cleaned.length > 120 ? `${cleaned.slice(0, 117).trimEnd()}...` : cleaned;
	return title || "Customer request";
}

accountWorkCustomersRouter.post("/requests/:id/item", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A request id is required");
	const current = await loadRequest(context, id);
	if (current.error) return unavailable(c);
	if (!current.data) return notFound(c, "Request not found");
	const request = current.data as unknown as CustomerRequestRow;
	if (request.work_item_id) return json(c, { error: "request_already_linked", message: "This request is already linked to an item" }, 409);
	let item: WorkItemRow;
	try {
		// The description stays empty: the request's own words stay in the request, which the
		// triage agent reads directly.
		item = await createWorkItem(context.client, {
			workspaceId: context.workspaceId,
			title: requestItemTitle(request),
			source: "ask",
			createdBy: context.user.id,
			authorKind: "user",
		});
	} catch {
		return unavailable(c, "work_item_create_failed");
	}
	const linked = await context.client.from("work_customer_requests").update({ work_item_id: item.id, status: "linked", updated_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("id", id).select(REQUEST_SELECT).maybeSingle();
	if (linked.error || !linked.data) return unavailable(c, "work_request_write_failed");
	await recordRequestLink(context.client, { workspaceId: context.workspaceId, userId: context.user.id }, item.id, request).catch(() => undefined);
	const triage = await triageWorkItem({
		env: c.env,
		client: context.client,
		workspaceId: context.workspaceId,
		itemId: item.id,
		requestedBy: { id: context.user.id, appMetadata: context.user.appMetadata },
		waitUntil: backgroundRunner(c),
	});
	return json(c, {
		item: formatWorkItem(triage.ok ? triage.item : item),
		request: formatCustomerRequest(linked.data as any),
		triage: triage.ok ? { ok: true } : { ok: false, code: triage.code, message: triage.message },
	}, 201);
});
