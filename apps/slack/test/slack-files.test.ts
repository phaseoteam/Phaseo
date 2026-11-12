import { describe, expect, it, vi } from "vitest";
import { createSlackClient } from "../src/slack-api";
import {
	attachmentParts, fileLines, MAX_FILES_PER_TURN, MAX_IMAGE_BYTES, readableKinds, readSharedFiles, sharedFileRefs, sniffedType, unreadByModel, uploadToThread,
	type SharedFile,
} from "../src/slack-files";
import { FakeDb, FakeSlack, BOT_TOKEN } from "./fakes";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const PDF = new TextEncoder().encode("%PDF-1.4\n");
const BOTH = { image: true, pdf: true };

function file(id: string, name = `${id}.png`): SharedFile {
	return { id, name, from: "U0PERSON01", inMessage: true };
}

function share(slack: FakeSlack, id: string, mimetype: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) {
	slack.files.set(id, { info: { id, mimetype, size: bytes.byteLength, url_private_download: `https://files.slack.com/files-pri/T0-${id}/download/f`, ...extra }, bytes });
}

describe("shared file references", () => {
	it("keeps ids and names only, without deleted or external files, at most 4 a message", () => {
		expect(sharedFileRefs([
			{ id: "F0AAAA0001", name: "a.png", url_private: "https://files.slack.com/x", mimetype: "image/png" },
			{ id: "F0AAAA0002", title: "Quarterly\nreport", mode: "hosted" },
			{ id: "F0AAAA0003", name: "gone.png", mode: "tombstone" },
			{ id: "F0AAAA0004", name: "drive.pdf", mode: "external" },
			{ id: "not-a-file", name: "x" },
			"F0AAAA0005",
			{ id: "F0AAAA0006" },
			{ id: "F0AAAA0007", name: "b.pdf" },
			{ id: "F0AAAA0008", name: "c.pdf" },
		])).toEqual([
			{ id: "F0AAAA0001", name: "a.png" },
			{ id: "F0AAAA0002", name: "Quarterly report" },
			{ id: "F0AAAA0006", name: "file" },
			{ id: "F0AAAA0007", name: "b.pdf" },
		]);
		expect(sharedFileRefs(undefined)).toEqual([]);
	});

	it("knows images and PDFs by their first bytes", () => {
		expect(sniffedType(PNG)).toBe("image/png");
		expect(sniffedType(JPEG)).toBe("image/jpeg");
		expect(sniffedType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
		expect(sniffedType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
		expect(sniffedType(PDF)).toBe("application/pdf");
		expect(sniffedType(new TextEncoder().encode("<!DOCTYPE html>"))).toBeNull();
	});
});

describe("reading shared files", () => {
	it("downloads images and PDFs, newest first, and gives them to the model as input parts", async () => {
		const slack = new FakeSlack();
		share(slack, "F0IMAGE001", "image/png", PNG);
		share(slack, "F0PDF00001", "application/pdf", PDF);
		const outcomes = await readSharedFiles(slack.client(BOT_TOKEN), [file("F0IMAGE001"), file("F0PDF00001", "q3.pdf")], { canRead: true, readable: BOTH });
		expect(outcomes.map((outcome) => outcome.status)).toEqual(["attached", "attached"]);
		expect(slack.of("files.info").map((call) => call.args)).toEqual([{ file: "F0IMAGE001" }, { file: "F0PDF00001" }]);
		expect(attachmentParts(outcomes)).toEqual([
			{ type: "input_image", image_url: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}` },
			{ type: "input_file", filename: "q3.pdf", file_data: `data:application/pdf;base64,${btoa(String.fromCharCode(...PDF))}` },
		]);
	});

	it("asks Slack for nothing without files:read", async () => {
		const slack = new FakeSlack();
		share(slack, "F0IMAGE001", "image/png", PNG);
		const outcomes = await readSharedFiles(slack.client(BOT_TOKEN), [file("F0IMAGE001")], { canRead: false, readable: BOTH });
		expect(outcomes.map((outcome) => outcome.status)).toEqual(["no_permission"]);
		expect(slack.calls).toEqual([]);
		expect(slack.downloads).toEqual([]);
	});

	it("checks type, model, size and count before downloading, and what arrived after", async () => {
		const slack = new FakeSlack();
		share(slack, "F0SHEET001", "text/csv", new TextEncoder().encode("a,b"));
		share(slack, "F0BIG00001", "image/png", PNG, { size: MAX_IMAGE_BYTES + 1 });
		share(slack, "F0LIAR0001", "image/jpeg", PDF);
		share(slack, "F0PDF00001", "application/pdf", PDF);
		slack.files.set("F0GONE0001", { info: { id: "F0GONE0001", mimetype: "image/png", mode: "tombstone" } });
		const outcomes = await readSharedFiles(slack.client(BOT_TOKEN), [file("F0SHEET001"), file("F0BIG00001"), file("F0LIAR0001"), file("F0GONE0001")], { canRead: true, readable: BOTH });
		expect(outcomes.map((outcome) => outcome.status)).toEqual(["unsupported_type", "too_large", "unavailable", "unavailable"]);
		// Only the one that looked right was downloaded; it turned out to be a PDF, not a JPEG.
		expect(slack.downloads).toEqual(["https://files.slack.com/files-pri/T0-F0LIAR0001/download/f"]);

		const pdfOnly = await readSharedFiles(slack.client(BOT_TOKEN), [file("F0PDF00001")], { canRead: true, readable: { image: true, pdf: false } });
		expect(pdfOnly.map((outcome) => outcome.status)).toEqual(["model_cant_read"]);

		const many = Array.from({ length: MAX_FILES_PER_TURN + 1 }, (_, index) => {
			share(slack, `F0MANY000${index}`, "image/png", PNG);
			return file(`F0MANY000${index}`);
		});
		expect((await readSharedFiles(slack.client(BOT_TOKEN), many, { canRead: true, readable: BOTH })).map((outcome) => outcome.status))
			.toEqual([...Array(MAX_FILES_PER_TURN).fill("attached"), "not_read"]);
	});

	it("tells the model which files are attached, and why the others aren't", () => {
		const attached = { file: file("F0IMAGE001", "a.png"), status: "attached", kind: "image", mimeType: "image/png", bytes: PNG } as const;
		const earlier = { file: { id: "F0PDF00001", name: "b.pdf", from: "U0PERSON02", inMessage: false }, status: "too_large", kind: "pdf" } as const;
		expect(fileLines([attached, earlier])).toEqual([
			"- a.png from <@U0PERSON01>, in the new message: attached after this text.",
			"- b.pdf from <@U0PERSON02>, earlier in the thread: too large to read (images up to 5 MB, PDFs up to 10 MB).",
		]);
		expect(fileLines(unreadByModel([attached]))).toEqual(["- a.png from <@U0PERSON01>, in the new message: the model answering can't read this kind of file."]);
	});

	it("reads what a model takes from its catalogue entry, and tries both for Auto or a model it can't find", async () => {
		const db = new FakeDb();
		db.tables.v2_models.push(
			{ model_slug: "acme/text", input_modalities: ["text"] },
			{ model_slug: "acme/vision", input_modalities: ["text", "image"] },
			{ model_slug: "acme/docs", input_modalities: ["text", "file"] },
		);
		await expect(readableKinds(db, "acme/text")).resolves.toEqual({ image: false, pdf: false });
		await expect(readableKinds(db, "acme/vision")).resolves.toEqual({ image: true, pdf: true });
		await expect(readableKinds(db, "acme/docs")).resolves.toEqual({ image: false, pdf: true });
		await expect(readableKinds(db, "phaseo/auto")).resolves.toEqual({ image: true, pdf: true });
		await expect(readableKinds(db, "acme/unknown")).resolves.toEqual({ image: true, pdf: true });
	});
});

describe("posting files in the thread", () => {
	it("uploads in Slack's two steps and shares the file in the thread", async () => {
		const slack = new FakeSlack();
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const result = await uploadToThread(slack.client(BOT_TOKEN), { channel: "C0CHANNEL1", threadTs: "1792600000.000100" }, { filename: "chart.png", title: "Spend", altText: "Bar chart: Spend.", bytes });
		expect(result).toEqual({ ok: true, fileId: "F0UPLOAD001" });
		expect(slack.calls.map((call) => [call.method, call.args])).toEqual([
			["files.getUploadURLExternal", { filename: "chart.png", length: 4, alt_txt: "Bar chart: Spend." }],
			["upload", { url: "https://files.slack.com/upload/v1/F0UPLOAD001", bytes: 4 }],
			["files.completeUploadExternal", { files: JSON.stringify([{ id: "F0UPLOAD001", title: "Spend" }]), channel_id: "C0CHANNEL1", thread_ts: "1792600000.000100" }],
		]);
	});

	it("stops at the first step Slack refuses", async () => {
		const slack = new FakeSlack();
		slack.failures.set("files.getUploadURLExternal", ["missing_scope"]);
		const target = { channel: "C0CHANNEL1", threadTs: "1792600000.000100" };
		const upload = { filename: "a.png", title: "A", altText: "A", bytes: PNG };
		await expect(uploadToThread(slack.client(BOT_TOKEN), target, upload)).resolves.toEqual({ ok: false, error: "missing_scope" });
		slack.failures.set("upload", ["failed"]);
		await expect(uploadToThread(slack.client(BOT_TOKEN), target, upload)).resolves.toEqual({ ok: false, error: "upload_failed" });
		expect(slack.of("files.completeUploadExternal")).toHaveLength(0);
	});
});

describe("the Slack client's file transfers", () => {
	it("sends the bot token only to Slack's file host, never follows a redirect, and stops at the size cap", async () => {
		const seen: Array<{ url: string; authorization: string | null; redirect: RequestRedirect | undefined }> = [];
		const responses: Response[] = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"), redirect: init?.redirect });
			return responses.shift()!;
		});
		const client = createSlackClient(BOT_TOKEN, fetchImpl as unknown as typeof fetch);

		await expect(client.download("https://evil.example/files-pri/x", 100)).resolves.toEqual({ ok: false, error: "not_slack_file" });
		await expect(client.download("http://files.slack.com/files-pri/x", 100)).resolves.toEqual({ ok: false, error: "not_slack_file" });
		expect(seen).toEqual([]);

		responses.push(new Response(PNG, { headers: { "content-type": "image/png; charset=binary" } }));
		await expect(client.download("https://files.slack.com/files-pri/T0-F0/download/a.png", 100)).resolves.toEqual({ ok: true, bytes: PNG, contentType: "image/png" });
		expect(seen[0]).toEqual({ url: "https://files.slack.com/files-pri/T0-F0/download/a.png", authorization: `Bearer ${BOT_TOKEN}`, redirect: "manual" });

		// A token that can't read the file is sent to Slack's sign-in page.
		responses.push(new Response(null, { status: 302, headers: { location: "https://slack.com/signin" } }));
		await expect(client.download("https://files.slack.com/files-pri/T0-F0/download/a.png", 100)).resolves.toEqual({ ok: false, error: "no_access" });

		responses.push(new Response(new Uint8Array(200), { headers: { "content-length": "200" } }));
		await expect(client.download("https://files.slack.com/files-pri/T0-F0/download/a.png", 100)).resolves.toEqual({ ok: false, error: "too_large" });
		// Without a length, the body is cut off at the cap.
		responses.push(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(80)); controller.enqueue(new Uint8Array(80)); controller.close(); } })));
		await expect(client.download("https://files.slack.com/files-pri/T0-F0/download/a.png", 100)).resolves.toEqual({ ok: false, error: "too_large" });
	});

	it("uploads bytes to Slack's upload URL only, without the token", async () => {
		const seen: Array<{ url: string; authorization: string | null; body: unknown }> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"), body: init?.body });
			return new Response("OK - 4");
		});
		const client = createSlackClient(BOT_TOKEN, fetchImpl as unknown as typeof fetch);
		await expect(client.upload("https://example.com/upload", PNG)).resolves.toBe(false);
		await expect(client.upload("https://files.slack.com/upload/v1/abc", PNG)).resolves.toBe(true);
		expect(seen).toEqual([{ url: "https://files.slack.com/upload/v1/abc", authorization: null, body: PNG }]);
	});
});
