import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
	createNotionFileUpload,
	formatNotionId,
	getPageEmail,
	getSupportConfig,
	notionRequest,
	plainTextFromRichText,
	safeText,
	validateSupportFiles,
} from "@/lib/support/notion";

type CommentPayload = {
	message?: string;
};

const CUSTOMER_PREFIX = /^Customer(?:\s*\([^)]+\))?:\s*/i;

async function resolveTicketId(context: {
	params: { ticketId: string } | Promise<{ ticketId: string }>;
}) {
	const params = await Promise.resolve(context.params);
	return params?.ticketId;
}

type SupportCommentAttachment = {
	name: string;
	url: string;
	type?: string;
};

async function ensureTicketAccess(pageId: string, email: string) {
	const config = getSupportConfig();
	const page = await notionRequest<any>(`/pages/${pageId}`, { method: "GET" });
	const pageEmail = getPageEmail(page, config.properties.email);
	if (!pageEmail || pageEmail.toLowerCase() !== email.toLowerCase()) {
		return null;
	}
	return page;
}

function mapAttachment(
	attachment: any,
	index: number
): SupportCommentAttachment | null {
	if (!attachment) return null;
	const url =
		attachment?.external?.url ??
		attachment?.file?.url ??
		attachment?.file_upload?.url ??
		"";
	if (!url) return null;
	const name =
		typeof attachment?.name === "string" && attachment.name.trim()
			? attachment.name.trim()
			: `Attachment ${index + 1}`;
	return {
		name,
		url,
		type: attachment?.type ?? "file",
	};
}

function mapComment(comment: any) {
	const raw = plainTextFromRichText(comment?.rich_text ?? []).trim();
	let role: "customer" | "support" = "support";
	let author = comment?.created_by?.name ?? "Support";
	let message = raw;
	const attachments = Array.isArray(comment?.attachments)
		? comment.attachments
				.map((attachment: any, index: number) =>
					mapAttachment(attachment, index)
				)
				.filter(
					(
						value: SupportCommentAttachment | null
					): value is SupportCommentAttachment => Boolean(value)
				)
		: [];

	if (CUSTOMER_PREFIX.test(raw)) {
		role = "customer";
		author = "You";
		message = raw.replace(CUSTOMER_PREFIX, "").trim();
	}

	return {
		id: comment?.id ?? "",
		createdTime: comment?.created_time ?? "",
		author,
		role,
		message,
		attachments,
	};
}

export async function GET(
	_request: Request,
	context: { params: Promise<{ ticketId: string }> }
) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user || !user.email) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const ticketId = await resolveTicketId(context);
	if (!ticketId) {
		return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
	}
	const pageId = formatNotionId(ticketId);

	try {
		const access = await ensureTicketAccess(pageId, user.email);
		if (!access) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		const payload = await notionRequest<{ results: any[] }>(
			`/comments?block_id=${pageId}&page_size=100`,
			{ method: "GET" }
		);
		const comments = (payload.results ?? []).map(mapComment);
		return NextResponse.json({ comments });
	} catch (error) {
		console.error("[support] failed to load comments", error);
		return NextResponse.json(
			{ error: "Failed to load comments" },
			{ status: 500 }
		);
	}
}

export async function POST(
	request: Request,
	context: { params: Promise<{ ticketId: string }> }
) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user || !user.email) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const message = safeText(formData.get("message"));
	if (!message) {
		return NextResponse.json(
			{ error: "Message is required" },
			{ status: 400 }
		);
	}

	const ticketId = await resolveTicketId(context);
	if (!ticketId) {
		return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
	}
	const pageId = formatNotionId(ticketId);

	try {
		const access = await ensureTicketAccess(pageId, user.email);
		if (!access) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		const files = formData
			.getAll("attachments")
			.filter((item): item is File => item instanceof File && item.size > 0);

		const fileError = validateSupportFiles(files);
		if (fileError) {
			return NextResponse.json({ error: fileError }, { status: 400 });
		}

		const attachments: Array<{ type: string; file_upload_id: string }> = [];
		for (const file of files) {
			try {
				const upload = await createNotionFileUpload(file);
				attachments.push({
					type: "file_upload",
					file_upload_id: upload.id,
				});
			} catch (error) {
				console.error("[support] failed to upload attachment", error);
				return NextResponse.json(
					{ error: "Failed to upload attachments" },
					{ status: 500 }
				);
			}
		}

		await notionRequest("/comments", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parent: { page_id: pageId },
				rich_text: [
					{
						type: "text",
						text: {
							content: `Customer (${user.email}): ${message}`,
						},
					},
				],
				attachments: attachments.length ? attachments : undefined,
			}),
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("[support] failed to send comment", error);
		return NextResponse.json(
			{ error: "Failed to send message" },
			{ status: 500 }
		);
	}
}
