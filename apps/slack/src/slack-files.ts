import { isAutoModel } from "./agent";
import type { SlackClient } from "./slack-api";
import type { Db } from "./supabase";

// Files in a Slack thread, both ways.
//
// Posting: a chart or generated image is uploaded with Slack's two-step upload
// (files.getUploadURLExternal, the bytes to the URL it returns, then
// files.completeUploadExternal, which shares it in the thread). It needs the
// files:write scope.
//
// Reading: images and PDFs shared in the message being answered, or in the
// thread messages the turn already read, are downloaded with the bot token
// (files:read) and given to the model with the turn's request. Only file ids and
// names are kept, with the thread's other Slack text in its coordinator; the
// bytes live in memory for the run that reads them and are never stored.
// Downloads are capped by count, size and type, and a file must start like the
// type it claims (Slack serves its sign-in page to a token that can't read it).

const FILE_ID_PATTERN = /^F[A-Z0-9]{2,31}$/;
const MAX_NAME_CHARS = 120;
/** Files read for one answer: the newest first. */
export const MAX_FILES_PER_TURN = 4;
/** Files kept per message (an event, or a message in the thread's history). */
export const MAX_FILES_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** All the files of one answer together; each model request carries them. */
export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_ALT_TEXT_CHARS = 1_000;
const MAX_TITLE_CHARS = 250;

/** A file shared in a Slack message: its id and name, never its contents. */
export type SharedFileRef = { id: string; name: string };

/** The files of a Slack message (an event's `files`, or a conversations.replies message's), without deleted or external ones. */
export function sharedFileRefs(files: unknown): SharedFileRef[] {
	if (!Array.isArray(files)) return [];
	const refs: SharedFileRef[] = [];
	for (const file of files) {
		if (!file || typeof file !== "object") continue;
		const { id, name, title, mode } = file as { id?: unknown; name?: unknown; title?: unknown; mode?: unknown };
		if (typeof id !== "string" || !FILE_ID_PATTERN.test(id) || mode === "tombstone" || mode === "external") continue;
		const label = [name, title].find((value): value is string => typeof value === "string" && value.trim() !== "");
		refs.push({ id, name: (label ?? "file").replace(/[\s\p{Cc}]+/gu, " ").trim().slice(0, MAX_NAME_CHARS) });
		if (refs.length >= MAX_FILES_PER_MESSAGE) break;
	}
	return refs;
}

export type FileKind = "image" | "pdf";

/** What the model can read, from its catalogue entry. Unknown (Auto, or a model the catalogue can't say) is tried. */
export type ReadableKinds = Record<FileKind, boolean>;

/**
 * Which shared files the model reads, from its catalogue input modalities:
 * images when it takes images; PDFs when it takes files or documents, or images
 * (the gateway sends PDFs to the providers that read them as a vision feature).
 * Auto picks a model for each request, and a model the catalogue doesn't know
 * can't be ruled out, so both are tried; a gateway refusal of the files then
 * makes the turn answer without them (workflow.ts).
 */
export async function readableKinds(db: Db, model: string): Promise<ReadableKinds> {
	if (isAutoModel(model)) return { image: true, pdf: true };
	const rows = await db.select<{ input_modalities: string[] | null }>("v2_models", { select: "input_modalities", model_slug: `eq.${model}`, limit: "1" }).catch(() => null);
	if (!rows?.length) return { image: true, pdf: true };
	const modalities = (rows[0].input_modalities ?? []).map((modality) => String(modality).trim().toLowerCase());
	const image = modalities.some((modality) => modality === "image" || modality.startsWith("image/") || modality.startsWith("image_"));
	const files = modalities.some((modality) => ["file", "document", "pdf"].includes(modality) || modality.startsWith("file_") || modality.startsWith("document_"));
	return { image, pdf: files || image };
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function fileKind(mimeType: string): FileKind | null {
	const type = mimeType.toLowerCase();
	if (IMAGE_TYPES.has(type)) return "image";
	if (type === "application/pdf") return "pdf";
	return null;
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
	return bytes.length >= offset + prefix.length && prefix.every((byte, index) => bytes[offset + index] === byte);
}

/** The type a file's first bytes show, so a sign-in page or a renamed file isn't sent as an image or PDF. */
export function sniffedType(bytes: Uint8Array): string | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
	if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
	return null;
}

/** A shared file, and who shared it; `inMessage`: it is on the message being answered. */
export type SharedFile = SharedFileRef & { from: string | null; inMessage: boolean };

/**
 * What became of a shared file for this answer. attached: read, and given to the
 * model. Otherwise why not: no_permission (the installation lacks files:read),
 * unsupported_type, model_cant_read, too_large, unavailable (Slack wouldn't
 * serve it, or it isn't what it claims), not_read (past the answer's file count
 * or total size).
 */
export type FileOutcome =
	| { file: SharedFile; status: "attached"; kind: FileKind; mimeType: string; bytes: Uint8Array }
	| { file: SharedFile; status: "no_permission" | "unsupported_type" | "model_cant_read" | "too_large" | "unavailable" | "not_read"; kind?: FileKind };

type SlackFileInfo = { mimetype?: unknown; size?: unknown; url_private_download?: unknown; url_private?: unknown; mode?: unknown };

/**
 * Reads the shared files for one answer, newest first: files.info for each (its
 * current type, size and download URL), then the download, within the caps.
 * Never throws: a file that can't be read gets the reason.
 */
export async function readSharedFiles(slack: SlackClient, files: SharedFile[], options: { canRead: boolean; readable: ReadableKinds }): Promise<FileOutcome[]> {
	const outcomes: FileOutcome[] = [];
	let total = 0;
	for (const [index, file] of files.entries()) {
		if (!options.canRead) {
			outcomes.push({ file, status: "no_permission" });
			continue;
		}
		if (index >= MAX_FILES_PER_TURN) {
			outcomes.push({ file, status: "not_read" });
			continue;
		}
		const info = await slack.call<{ file?: SlackFileInfo }>("files.info", { file: file.id }, { form: true }).catch(() => null);
		const details = info?.ok ? info.data.file : undefined;
		const url = typeof details?.url_private_download === "string" ? details.url_private_download : typeof details?.url_private === "string" ? details.url_private : null;
		if (!details || !url || details.mode === "tombstone" || details.mode === "external") {
			outcomes.push({ file, status: info?.ok === false && info.error === "missing_scope" ? "no_permission" : "unavailable" });
			continue;
		}
		const kind = fileKind(typeof details.mimetype === "string" ? details.mimetype : "");
		if (!kind) {
			outcomes.push({ file, status: "unsupported_type" });
			continue;
		}
		if (!options.readable[kind]) {
			outcomes.push({ file, status: "model_cant_read", kind });
			continue;
		}
		const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
		const size = Number(details.size);
		if (Number.isFinite(size) && size > limit) {
			outcomes.push({ file, status: "too_large", kind });
			continue;
		}
		if (Number.isFinite(size) && total + size > MAX_TOTAL_BYTES) {
			outcomes.push({ file, status: "not_read", kind });
			continue;
		}
		const downloaded = await slack.download(url, Math.min(limit, MAX_TOTAL_BYTES - total));
		if (downloaded.ok === false) {
			outcomes.push({ file, status: downloaded.error === "too_large" ? "too_large" : downloaded.error === "no_access" ? "no_permission" : "unavailable", kind });
			continue;
		}
		const mimeType = sniffedType(downloaded.bytes);
		if (!mimeType || fileKind(mimeType) !== kind) {
			outcomes.push({ file, status: "unavailable", kind });
			continue;
		}
		total += downloaded.bytes.byteLength;
		outcomes.push({ file, status: "attached", kind, mimeType, bytes: downloaded.bytes });
	}
	return outcomes;
}

function base64(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
}

/** The model request's input parts for the attached files (Responses input_image and input_file). */
export function attachmentParts(outcomes: FileOutcome[]): Array<Record<string, unknown>> {
	return outcomes.flatMap((outcome): Array<Record<string, unknown>> => {
		if (outcome.status !== "attached") return [];
		const data = `data:${outcome.mimeType};base64,${base64(outcome.bytes)}`;
		return outcome.kind === "image"
			? [{ type: "input_image", image_url: data }]
			: [{ type: "input_file", filename: outcome.file.name, file_data: data }];
	});
}

const NOT_ATTACHED: Record<Exclude<FileOutcome["status"], "attached">, string> = {
	no_permission: "you can't open files here yet: an admin needs to update the Phaseo agent's Slack permissions in Phaseo (Settings → Slack)",
	unsupported_type: "you can only read images (PNG, JPEG, GIF, WebP) and PDFs",
	model_cant_read: "the model answering can't read this kind of file",
	too_large: `too large to read (images up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB, PDFs up to ${MAX_PDF_BYTES / 1024 / 1024} MB)`,
	unavailable: "Slack didn't let you read it",
	not_read: `not read: you read at most ${MAX_FILES_PER_TURN} files, ${MAX_TOTAL_BYTES / 1024 / 1024} MB together, for one answer`,
};

/** The outcomes as they are when the model turns out not to read the attached files: none is attached. */
export function unreadByModel(outcomes: FileOutcome[]): FileOutcome[] {
	return outcomes.map((outcome) => outcome.status === "attached" ? { file: outcome.file, status: "model_cant_read", kind: outcome.kind } : outcome);
}

/** The prompt's lines about the shared files: which are attached, and why the others aren't. */
export function fileLines(outcomes: FileOutcome[]): string[] {
	return outcomes.map((outcome) => {
		const where = outcome.file.inMessage ? "in the new message" : "earlier in the thread";
		const by = outcome.file.from ? ` from <@${outcome.file.from}>` : "";
		const status = outcome.status === "attached" ? "attached after this text" : NOT_ATTACHED[outcome.status];
		return `- ${outcome.file.name}${by}, ${where}: ${status}.`;
	});
}

export type UploadResult = { ok: true; fileId: string } | { ok: false; error: string };

/**
 * Uploads a file and shares it in the thread, as the bot. Never throws; the
 * error is Slack's code, or upload_failed for the bytes' own request.
 */
export async function uploadToThread(slack: SlackClient, target: { channel: string; threadTs: string }, file: { filename: string; title: string; altText: string; bytes: Uint8Array }): Promise<UploadResult> {
	const url = await slack.call<{ upload_url?: unknown; file_id?: unknown }>("files.getUploadURLExternal", {
		filename: file.filename,
		length: file.bytes.byteLength,
		alt_txt: file.altText.slice(0, MAX_ALT_TEXT_CHARS),
	}, { form: true });
	if (url.ok === false) return { ok: false, error: url.error };
	const uploadUrl = typeof url.data.upload_url === "string" ? url.data.upload_url : null;
	const fileId = typeof url.data.file_id === "string" && FILE_ID_PATTERN.test(url.data.file_id) ? url.data.file_id : null;
	if (!uploadUrl || !fileId) return { ok: false, error: "slack_response_invalid" };
	if (!(await slack.upload(uploadUrl, file.bytes))) return { ok: false, error: "upload_failed" };
	const completed = await slack.call("files.completeUploadExternal", {
		files: JSON.stringify([{ id: fileId, title: file.title.slice(0, MAX_TITLE_CHARS) }]),
		channel_id: target.channel,
		thread_ts: target.threadTs,
	}, { form: true });
	return completed.ok ? { ok: true, fileId } : { ok: false, error: completed.error };
}
