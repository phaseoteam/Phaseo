// Work item attachments: files a member adds to an item, kept in R2 (WORK_FILES) under a random
// key. They are never sent to GitHub or to agents. Downloads always come back as an attachment
// with nosniff and a sandboxing CSP, so an uploaded HTML or SVG file can't run in Phaseo's origin.
//
//   GET    /items/:number/attachments                 list
//   POST   /items/:number/attachments?name=<file>     upload (raw body, content-type header, ≤ 25 MB)
//   GET    /attachments/:id/download                  the file
//   DELETE /attachments/:id                           remove (the uploader, or a workspace owner/admin)

import { accessFromQuery, badRequest, isWorkspaceOwnerOrAdmin, json, notFound, pathUuid, unavailable } from "@/routes/account/work-shared";
import { addWorkItemEvent, bumpWorkItemActivity, loadWorkItemByNumber } from "./items";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ITEM = 50;
const ATTACHMENT_COLUMNS = "id,workspace_id,work_item_id,file_name,content_type,size_bytes,object_key,uploaded_by,created_at";

export type AttachmentRow = { id: string; workspace_id: string; work_item_id: string; file_name: string; content_type: string; size_bytes: number; object_key: string; uploaded_by: string | null; created_at: string };
export type Attachment = { id: string; fileName: string; contentType: string; sizeBytes: number; uploadedBy: string | null; createdAt: string };

export function formatAttachment(row: AttachmentRow): Attachment {
	return { id: row.id, fileName: row.file_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes) || 0, uploadedBy: row.uploaded_by, createdAt: row.created_at };
}

/** A safe file name: the last path part, no control characters or quotes, at most 200 characters. */
export function cleanFileName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const base = value.replace(/\\/g, "/").split("/").pop() ?? "";
	const clean = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200);
	return clean && clean !== "." && clean !== ".." ? clean : null;
}

/** The stored content type: a plain type/subtype, or application/octet-stream. */
export function cleanContentType(value: string | null | undefined): string {
	const type = (value ?? "").split(";")[0]!.trim().toLowerCase();
	return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(type) && type.length <= 100 ? type : "application/octet-stream";
}

/** Content-Disposition for a download: ASCII fallback plus the UTF-8 name (RFC 6266). */
export function contentDisposition(fileName: string): string {
	const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
	return out;
}

function itemNumber(c: any): number | null {
	const number = Number(c.req.param("number"));
	return Number.isInteger(number) && number > 0 ? number : null;
}

async function handleList(c: any): Promise<Response> {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const number = itemNumber(c);
	if (!number) return badRequest(c, "An item number is required");
	const item = await loadWorkItemByNumber(context.client, context.workspaceId, number).catch(() => null);
	if (!item) return notFound(c, "Item not found");
	const { data, error } = await context.client.from("work_attachments").select(ATTACHMENT_COLUMNS)
		.eq("workspace_id", context.workspaceId).eq("work_item_id", item.id).order("created_at", { ascending: true }).limit(MAX_ATTACHMENTS_PER_ITEM);
	if (error) return unavailable(c);
	return json(c, { attachments: ((data ?? []) as AttachmentRow[]).map(formatAttachment), available: Boolean(c.env.WORK_FILES) });
}

async function handleUpload(c: any): Promise<Response> {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const bucket = c.env.WORK_FILES as R2Bucket | undefined;
	if (!bucket) return json(c, { error: "files_unavailable", message: "File storage isn't set up on this server yet" }, 503);
	const number = itemNumber(c);
	if (!number) return badRequest(c, "An item number is required");
	const fileName = cleanFileName(c.req.query("name"));
	if (!fileName) return badRequest(c, "name must be the file's name");
	const declared = Number(c.req.header("content-length") ?? "");
	if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) return json(c, { error: "file_too_large", message: "Files can be at most 25 MB" }, 413);
	const item = await loadWorkItemByNumber(context.client, context.workspaceId, number).catch(() => null);
	if (!item) return notFound(c, "Item not found");
	const count = await context.client.from("work_attachments").select("id", { count: "exact", head: true }).eq("work_item_id", item.id);
	if (count.error) return unavailable(c);
	if ((count.count ?? 0) >= MAX_ATTACHMENTS_PER_ITEM) return badRequest(c, `An item can have at most ${MAX_ATTACHMENTS_PER_ITEM} attachments`);
	const body = await readLimited(c.req.raw.body, MAX_ATTACHMENT_BYTES);
	if (!body) return json(c, { error: "file_too_large", message: "Files can be at most 25 MB" }, 413);
	if (!body.byteLength) return badRequest(c, "The file is empty");
	const contentType = cleanContentType(c.req.header("content-type"));
	const objectKey = `work-attachments/${context.workspaceId}/${crypto.randomUUID()}`;
	try {
		await bucket.put(objectKey, body, { httpMetadata: { contentType }, customMetadata: { workspaceId: context.workspaceId, itemId: item.id } });
	} catch (error) {
		console.error("[work] attachment not stored", { message: error instanceof Error ? error.message : String(error) });
		return unavailable(c, "files_write_failed");
	}
	const { data, error } = await context.client.from("work_attachments").insert({
		workspace_id: context.workspaceId,
		work_item_id: item.id,
		file_name: fileName,
		content_type: contentType,
		size_bytes: body.byteLength,
		object_key: objectKey,
		uploaded_by: context.user.id,
	}).select(ATTACHMENT_COLUMNS).maybeSingle();
	if (error || !data) {
		await bucket.delete(objectKey).catch(() => undefined);
		return unavailable(c, "files_write_failed");
	}
	await addWorkItemEvent(context.client, { workspaceId: context.workspaceId, workItemId: item.id, kind: "attachment", authorKind: "user", authorUserId: context.user.id, body: fileName, data: { attachmentId: (data as AttachmentRow).id, sizeBytes: body.byteLength } }).catch(() => undefined);
	await bumpWorkItemActivity(context.client, context.workspaceId, item.id).catch(() => undefined);
	return json(c, { attachment: formatAttachment(data as AttachmentRow) }, 201);
}

async function loadAttachment(c: any, context: { client: any; workspaceId: string }): Promise<{ row: AttachmentRow } | { response: Response }> {
	const id = pathUuid(c, "id");
	if (!id) return { response: badRequest(c, "An attachment id is required") };
	const { data, error } = await context.client.from("work_attachments").select(ATTACHMENT_COLUMNS).eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) return { response: unavailable(c) };
	if (!data) return { response: notFound(c, "Attachment not found") };
	return { row: data as AttachmentRow };
}

async function handleDownload(c: any): Promise<Response> {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const loaded = await loadAttachment(c, access.context);
	if ("response" in loaded) return loaded.response;
	const bucket = c.env.WORK_FILES as R2Bucket | undefined;
	const object = bucket ? await bucket.get(loaded.row.object_key).catch(() => null) : null;
	if (!object) return notFound(c, "The file is no longer stored");
	return new Response(object.body, {
		status: 200,
		headers: {
			"Content-Type": loaded.row.content_type || "application/octet-stream",
			"Content-Length": String(object.size),
			"Content-Disposition": contentDisposition(loaded.row.file_name),
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox; default-src 'none'",
			"Cache-Control": "private, no-store",
		},
	});
}

async function handleDelete(c: any): Promise<Response> {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const loaded = await loadAttachment(c, context);
	if ("response" in loaded) return loaded.response;
	if (loaded.row.uploaded_by !== context.user.id && !isWorkspaceOwnerOrAdmin(context)) return json(c, { error: "forbidden", message: "Only the person who added it, or a workspace admin, can remove it" }, 403);
	const { error } = await context.client.from("work_attachments").delete().eq("workspace_id", context.workspaceId).eq("id", loaded.row.id);
	if (error) return unavailable(c, "files_write_failed");
	const bucket = c.env.WORK_FILES as R2Bucket | undefined;
	if (bucket) await bucket.delete(loaded.row.object_key).catch((deleteError: unknown) => console.error("[work] attachment object not deleted", { id: loaded.row.id, message: String(deleteError) }));
	return json(c, { id: loaded.row.id, deleted: true });
}

type RouteHandler = (c: any) => Promise<Response>;
type RouteRegistrar = (path: string, handler: RouteHandler) => unknown;

/** Registers the attachment routes on the account work router. */
export function registerAttachmentRoutes(router: { get: RouteRegistrar; post: RouteRegistrar; delete: RouteRegistrar }): void {
	router.get("/items/:number/attachments", handleList);
	router.post("/items/:number/attachments", handleUpload);
	router.get("/attachments/:id/download", handleDownload);
	router.delete("/attachments/:id", handleDelete);
}
