import { NextResponse } from "next/server";
import {
	buildSupportProperties,
	createNotionFileUpload,
	formatNotionId,
	getSupportConfig,
	notionRequest,
	parseContactMethods,
	safeText,
	validateSupportFiles,
	type SupportTicketInput,
} from "@/lib/support/notion";

export async function POST(req: Request) {
	const config = getSupportConfig();
	if (!config.databaseId) {
		return NextResponse.json(
			{ error: "Missing NOTION_SUPPORT_DATABASE_ID env var" },
			{ status: 500 }
		);
	}

	let formData: FormData;
	try {
		formData = await req.formData();
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 }
		);
	}

	const input: SupportTicketInput = {
		name: safeText(formData.get("name")),
		email: safeText(formData.get("email")),
		issueType: safeText(formData.get("issueType")),
		issueArea: safeText(formData.get("issueArea")),
		customerType: safeText(formData.get("customerType")),
		subject: safeText(formData.get("subject")),
		details: safeText(formData.get("details")),
		references: safeText(formData.get("references")),
		internalId: safeText(formData.get("internalId")),
		accountLink: safeText(formData.get("accountLink")),
		githubLink: safeText(formData.get("githubLink")),
		linearLink: safeText(formData.get("linearLink")),
		contactMethods: parseContactMethods(formData.get("contactMethods")),
	};

	if (!input.email || !input.details) {
		return NextResponse.json(
			{ error: "Missing required fields" },
			{ status: 400 }
		);
	}

	const files = formData
		.getAll("attachments")
		.filter((item): item is File => item instanceof File && item.size > 0);

	const fileError = validateSupportFiles(files);
	if (fileError) {
		return NextResponse.json({ error: fileError }, { status: 400 });
	}

	const uploadedFiles: Array<{ id: string; name: string }> = [];
	for (const file of files) {
		try {
			const upload = await createNotionFileUpload(file);
			uploadedFiles.push(upload);
		} catch (error) {
			console.error("[contact] failed to upload file", error);
			return NextResponse.json(
				{ error: "Failed to upload attachments" },
				{ status: 500 }
			);
		}
	}

	const properties = buildSupportProperties({
		...input,
		attachments: uploadedFiles,
	});

	try {
		const payload = await notionRequest<{ id?: string }>("/pages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parent: { database_id: formatNotionId(config.databaseId) },
				properties,
			}),
		});

		return NextResponse.json({ ok: true, ticketId: payload?.id ?? null });
	} catch (error) {
		console.error("[contact] failed to create notion page", error);
		return NextResponse.json(
			{ error: "Failed to create support request" },
			{ status: 500 }
		);
	}
}
