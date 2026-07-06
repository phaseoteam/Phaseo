import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_SUPPORT_INBOX_EMAIL = "support@phaseo.com";

const supportTicketSchema = z.object({
	name: z.string().trim().min(2, "Enter your name"),
	email: z
		.string()
		.trim()
		.regex(EMAIL_PATTERN, "Enter a valid email address"),
	issueArea: z.string().trim().min(1, "Choose where the issue is"),
	details: z
		.string()
		.trim()
		.min(30, "Add at least 30 characters of detail"),
	references: z
		.string()
		.trim()
		.refine((value) => !value || value.length >= 8, {
			message: "Add at least 8 characters or leave this blank",
		}),
});

type ContactMethod = {
	type: string;
	value: string;
};

type SupportTicketInput = {
	name: string;
	email: string;
	issueType: string;
	issueArea: string;
	customerType: string;
	details: string;
	references: string;
	internalId: string;
	accountLink: string;
	githubLink: string;
	linearLink: string;
	contactMethods: ContactMethod[];
};

function safeText(value: FormDataEntryValue | null): string {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, 5000);
}

function parseContactMethods(value: FormDataEntryValue | null): ContactMethod[] {
	if (typeof value !== "string" || !value.trim()) return [];

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.map((item) => ({
				type: typeof item?.type === "string" ? item.type.trim() : "",
				value: typeof item?.value === "string" ? item.value.trim() : "",
			}))
			.filter((item) => item.type && item.value)
			.slice(0, 5);
	} catch {
		return [];
	}
}

function validateSupportFiles(files: File[]): string | null {
	if (files.length > MAX_ATTACHMENTS) {
		return `Attach up to ${MAX_ATTACHMENTS} images`;
	}

	for (const file of files) {
		if (!file.type.startsWith("image/")) {
			return "Attachments must be images";
		}
		if (file.size > MAX_ATTACHMENT_BYTES) {
			return "Each attachment must be 5MB or smaller";
		}
	}

	return null;
}

function getRequiredEnv(name: string): string | null {
	const value = process.env[name]?.trim();
	return value ? value : null;
}

function resolveSupportDestinationEmail(): string {
	return (
		getRequiredEnv("SUPPORT_TICKET_TO_EMAIL") ??
		getRequiredEnv("SUPPORT_EMAIL") ??
		getRequiredEnv("TAWK_TICKET_FORWARDING_EMAIL") ??
		getRequiredEnv("TAWK_SUPPORT_EMAIL") ??
		getRequiredEnv("SUPPORT_TICKET_FORWARDING_EMAIL") ??
		DEFAULT_SUPPORT_INBOX_EMAIL
	);
}

function buildTicketSubject(input: SupportTicketInput): string {
	const subject = input.issueType || input.issueArea || "Support request";
	return `[Phaseo Support] ${subject}`.slice(0, 180);
}

function buildTicketBody(input: SupportTicketInput, files: File[]): string {
	const lines = [
		"New Phaseo support ticket",
		"",
		`Name: ${input.name || "Not provided"}`,
		`Email: ${input.email}`,
		`Issue type: ${input.issueType || "Not provided"}`,
		`Issue area: ${input.issueArea || "Not provided"}`,
		`Customer type: ${input.customerType || "Not provided"}`,
		`Internal ID: ${input.internalId || "Not provided"}`,
		`Account link: ${input.accountLink || "Not provided"}`,
		`GitHub link: ${input.githubLink || "Not provided"}`,
		`Linear link: ${input.linearLink || "Not provided"}`,
		"",
		"Contact methods:",
		input.contactMethods.length
			? input.contactMethods
					.map((method) => `- ${method.type}: ${method.value}`)
					.join("\n")
			: "- email: " + input.email,
		"",
		"Details:",
		input.details,
		"",
		"Reference info:",
		input.references || "Not provided",
		"",
		"Attachments:",
		files.length ? files.map((file) => `- ${file.name}`).join("\n") : "None",
	];

	return lines.join("\n");
}

export async function POST(req: Request) {
	let userEmail = "";
	try {
		const supabase = await createClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();
		userEmail = user?.email ?? "";
	} catch {
		userEmail = "";
	}

	if (!userEmail) {
		return NextResponse.json(
			{ error: "Sign in to create a private support ticket" },
			{ status: 401 }
		);
	}

	const resendApiKey = getRequiredEnv("RESEND_API_KEY");
	const supportDestinationEmail = resolveSupportDestinationEmail();
	const fromEmail =
		getRequiredEnv("RESEND_SUPPORT_FROM_EMAIL") ??
		getRequiredEnv("RESEND_FROM_EMAIL") ??
		"Phaseo Support <noreply@phaseo.app>";

	if (!resendApiKey) {
		return NextResponse.json(
			{ error: "Missing RESEND_API_KEY env var" },
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
		email: safeText(formData.get("email")) || userEmail,
		issueType: safeText(formData.get("issueType")),
		issueArea: safeText(formData.get("issueArea")),
		customerType: safeText(formData.get("customerType")),
		details: safeText(formData.get("details")),
		references: safeText(formData.get("references")),
		internalId: safeText(formData.get("internalId")),
		accountLink: safeText(formData.get("accountLink")),
		githubLink: safeText(formData.get("githubLink")),
		linearLink: safeText(formData.get("linearLink")),
		contactMethods: parseContactMethods(formData.get("contactMethods")),
	};

	const validation = supportTicketSchema.safeParse({
		name: input.name,
		email: input.email,
		issueArea: input.issueArea,
		details: input.details,
		references: input.references,
	});

	if (!validation.success) {
		return NextResponse.json(
			{ error: validation.error.issues[0]?.message ?? "Invalid support request" },
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

	const attachments = await Promise.all(
		files.map(async (file) => ({
			filename: file.name,
			content: Buffer.from(await file.arrayBuffer()),
		}))
	);

	try {
		const resend = new Resend(resendApiKey);
		const { data, error } = await resend.emails.send({
			from: fromEmail,
			to: supportDestinationEmail,
			replyTo: input.email,
			subject: buildTicketSubject(input),
			text: buildTicketBody(input, files),
			attachments: attachments.length ? attachments : undefined,
		});

		if (error) {
			void error;
			return NextResponse.json(
				{ error: "Failed to create support ticket" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ ok: true, ticketId: data?.id ?? null });
	} catch (error) {
		void error;
		return NextResponse.json(
			{ error: "Failed to create support ticket" },
			{ status: 500 }
		);
	}
}
