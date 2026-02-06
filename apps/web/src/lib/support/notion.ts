const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_API_VERSION ?? "2022-06-28";
const NOTION_DATABASE_ID = process.env.NOTION_SUPPORT_DATABASE_ID ?? "";

const NOTION_TITLE_PROPERTY =
	process.env.NOTION_SUPPORT_TITLE_PROPERTY ?? "Name";
const NOTION_REQUESTER_PROPERTY =
	process.env.NOTION_SUPPORT_REQUESTER_PROPERTY ?? "Requester";
const NOTION_EMAIL_PROPERTY =
	process.env.NOTION_SUPPORT_EMAIL_PROPERTY ?? "Email";
const NOTION_ISSUE_TYPE_PROPERTY =
	process.env.NOTION_SUPPORT_ISSUE_TYPE_PROPERTY ?? "Issue Type";
const NOTION_ISSUE_AREA_PROPERTY =
	process.env.NOTION_SUPPORT_ISSUE_AREA_PROPERTY ?? "Issue Area";
const NOTION_CUSTOMER_TYPE_PROPERTY =
	process.env.NOTION_SUPPORT_CUSTOMER_TYPE_PROPERTY ?? "Customer Type";
const NOTION_SUBJECT_PROPERTY =
	process.env.NOTION_SUPPORT_SUBJECT_PROPERTY ?? "Subject";
const NOTION_DETAILS_PROPERTY =
	process.env.NOTION_SUPPORT_DETAILS_PROPERTY ?? "Details";
const NOTION_REFERENCES_PROPERTY =
	process.env.NOTION_SUPPORT_REFERENCES_PROPERTY ?? "References";
const NOTION_CONTACTS_PROPERTY =
	process.env.NOTION_SUPPORT_CONTACTS_PROPERTY ?? "Contact Methods";
const NOTION_ATTACHMENTS_PROPERTY =
	process.env.NOTION_SUPPORT_ATTACHMENTS_PROPERTY ?? "Attachments";
const NOTION_INTERNAL_ID_PROPERTY =
	process.env.NOTION_SUPPORT_INTERNAL_ID_PROPERTY ?? "Internal ID";
const NOTION_ACCOUNT_LINK_PROPERTY =
	process.env.NOTION_SUPPORT_ACCOUNT_LINK_PROPERTY ?? "Account Link";
const NOTION_GITHUB_LINK_PROPERTY =
	process.env.NOTION_SUPPORT_GITHUB_LINK_PROPERTY ?? "GitHub Link";
const NOTION_LINEAR_LINK_PROPERTY =
	process.env.NOTION_SUPPORT_LINEAR_LINK_PROPERTY ?? "Linear Link";
const NOTION_STATUS_PROPERTY =
	process.env.NOTION_SUPPORT_STATUS_PROPERTY ?? "Status";
const NOTION_STATUS_DEFAULT =
	process.env.NOTION_SUPPORT_STATUS_DEFAULT ?? "New";
const NOTION_ASSIGNEE_PROPERTY =
	process.env.NOTION_SUPPORT_ASSIGNEE_PROPERTY ?? "Assignee";
const NOTION_ASSIGNEE_ID = process.env.NOTION_SUPPORT_ASSIGNEE_ID ?? "";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/svg+xml",
]);

export type ContactMethod = {
	type: string;
	value: string;
};

export type SupportTicketInput = {
	name: string;
	email: string;
	issueType: string;
	issueArea: string;
	customerType: string;
	subject: string;
	details: string;
	references: string;
	internalId: string;
	accountLink: string;
	githubLink: string;
	linearLink: string;
	contactMethods: ContactMethod[];
	attachments?: Array<{ id: string; name: string }>;
};

export function getSupportConfig() {
	return {
		apiUrl: NOTION_API_URL,
		version: NOTION_VERSION,
		databaseId: NOTION_DATABASE_ID,
		properties: {
			title: NOTION_TITLE_PROPERTY,
			requester: NOTION_REQUESTER_PROPERTY,
			email: NOTION_EMAIL_PROPERTY,
			issueType: NOTION_ISSUE_TYPE_PROPERTY,
			issueArea: NOTION_ISSUE_AREA_PROPERTY,
			customerType: NOTION_CUSTOMER_TYPE_PROPERTY,
			subject: NOTION_SUBJECT_PROPERTY,
			details: NOTION_DETAILS_PROPERTY,
			references: NOTION_REFERENCES_PROPERTY,
			contacts: NOTION_CONTACTS_PROPERTY,
			attachments: NOTION_ATTACHMENTS_PROPERTY,
			internalId: NOTION_INTERNAL_ID_PROPERTY,
			accountLink: NOTION_ACCOUNT_LINK_PROPERTY,
			githubLink: NOTION_GITHUB_LINK_PROPERTY,
			linearLink: NOTION_LINEAR_LINK_PROPERTY,
			status: NOTION_STATUS_PROPERTY,
			assignee: NOTION_ASSIGNEE_PROPERTY,
		},
		statusDefault: NOTION_STATUS_DEFAULT,
		assigneeId: NOTION_ASSIGNEE_ID,
	};
}

export function resolveNotionKey() {
	const raw =
		process.env.NOTION_INTEGRATION_SECRET ?? process.env.NOTION_API_KEY ?? "";
	if (!raw) return null;
	if (raw.startsWith("Bearer ")) return raw.replace(/^Bearer\s+/i, "");
	return raw;
}

export function formatNotionId(value: string) {
	const trimmed = value.replace(/-/g, "");
	if (trimmed.length !== 32) return value;
	return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(
		12,
		16
	)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
}

export async function notionRequest<T>(path: string, init: RequestInit) {
	const apiKey = resolveNotionKey();
	if (!apiKey) {
		throw new Error("Missing NOTION_INTEGRATION_SECRET env var");
	}

	const headers = new Headers(init.headers ?? {});
	headers.set("Authorization", `Bearer ${apiKey}`);
	headers.set("Notion-Version", NOTION_VERSION);

	const response = await fetch(`${NOTION_API_URL}${path}`, {
		...init,
		headers,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Notion API error: ${response.status} ${body}`);
	}

	const payload = (await response.json().catch(() => null)) as T | null;
	if (!payload) throw new Error("Notion API returned empty response");
	return payload;
}

export async function createNotionFileUpload(file: File) {
	const data = await notionRequest<{
		id?: string;
		upload_url?: string;
		file_upload?: { id?: string; upload_url?: string };
	}>("/file_uploads", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			filename: file.name,
			content_type: file.type,
		}),
	});

	const uploadId = data.file_upload?.id ?? data.id;
	const uploadUrl = data.file_upload?.upload_url ?? data.upload_url;
	if (!uploadUrl || !uploadId) {
		throw new Error("Notion file upload could not be created");
	}

	const apiKey = resolveNotionKey();
	if (!apiKey) throw new Error("Missing NOTION_INTEGRATION_SECRET env var");

	const uploadForm = new FormData();
	uploadForm.append("file", file, file.name);

	const uploadRes = await fetch(uploadUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Notion-Version": NOTION_VERSION,
		},
		body: uploadForm,
	});

	if (!uploadRes.ok) {
		const body = await uploadRes.text().catch(() => "");
		throw new Error(`Notion file upload failed: ${uploadRes.status} ${body}`);
	}

	return { id: uploadId, name: file.name };
}

export function safeText(value: FormDataEntryValue | null) {
	if (!value) return "";
	return String(value).trim();
}

export function parseContactMethods(value: FormDataEntryValue | null): ContactMethod[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(String(value)) as ContactMethod[];
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((entry) => entry && typeof entry === "object")
			.map((entry) => ({
				type: String((entry as ContactMethod).type ?? "").trim(),
				value: String((entry as ContactMethod).value ?? "").trim(),
			}))
			.filter((entry) => entry.type && entry.value);
	} catch {
		return [];
	}
}

export function validateSupportFiles(files: File[]) {
	if (files.length > MAX_FILES) {
		return `You can attach up to ${MAX_FILES} images`;
	}

	let totalSize = 0;
	for (const file of files) {
		totalSize += file.size;
		if (file.size > MAX_FILE_BYTES) {
			return "Each image must be under 5 MB";
		}
		if (!ALLOWED_MIME_TYPES.has(file.type)) {
			return "Only image uploads are supported";
		}
	}
	if (totalSize > MAX_TOTAL_BYTES) {
		return "Total attachment size is too large";
	}

	return null;
}

export function buildSupportProperties(input: SupportTicketInput) {
	const config = getSupportConfig();
	const title = ["Support", input.issueType || null, input.subject || null]
		.filter(Boolean)
		.join(" - ");

	const contactLines = [
		`Email: ${input.email}`,
		...input.contactMethods.map((method) => `${method.type}: ${method.value}`),
	];

	const properties: Record<string, any> = {
		[config.properties.title]: {
			title: [
				{
					text: {
						content: title || "Support",
					},
				},
			],
		},
		[config.properties.email]: { email: input.email },
	};

	if (input.name) {
		properties[config.properties.requester] = {
			rich_text: [{ text: { content: input.name } }],
		};
	}
	if (input.issueType) {
		properties[config.properties.issueType] = {
			select: { name: input.issueType },
		};
	}
	if (input.issueArea) {
		properties[config.properties.issueArea] = {
			select: { name: input.issueArea },
		};
	}
	if (input.customerType) {
		properties[config.properties.customerType] = {
			select: { name: input.customerType },
		};
	}
	if (input.subject) {
		properties[config.properties.subject] = {
			rich_text: [{ text: { content: input.subject } }],
		};
	}
	if (input.details) {
		properties[config.properties.details] = {
			rich_text: [{ text: { content: input.details } }],
		};
	}
	if (input.references) {
		properties[config.properties.references] = {
			rich_text: [{ text: { content: input.references } }],
		};
	}
	if (contactLines.length) {
		properties[config.properties.contacts] = {
			rich_text: [{ text: { content: contactLines.join("\n") } }],
		};
	}
	if (input.internalId) {
		properties[config.properties.internalId] = {
			rich_text: [{ text: { content: input.internalId } }],
		};
	}
	if (input.accountLink) {
		properties[config.properties.accountLink] = { url: input.accountLink };
	}
	if (input.githubLink) {
		properties[config.properties.githubLink] = { url: input.githubLink };
	}
	if (input.linearLink) {
		properties[config.properties.linearLink] = { url: input.linearLink };
	}
	if (config.properties.status && config.statusDefault) {
		properties[config.properties.status] = {
			select: { name: config.statusDefault },
		};
	}
	if (config.properties.assignee && config.assigneeId) {
		properties[config.properties.assignee] = {
			people: [{ id: config.assigneeId }],
		};
	}
	if (input.attachments && input.attachments.length) {
		properties[config.properties.attachments] = {
			files: input.attachments.map((file) => ({
				type: "file_upload",
				name: file.name,
				file_upload: { id: file.id },
			})),
		};
	}

	return properties;
}

export function plainTextFromRichText(value: any[] | undefined) {
	if (!Array.isArray(value)) return "";
	return value.map((item) => item?.plain_text ?? item?.text?.content ?? "").join("");
}

export function getPageProperty(page: any, name: string) {
	return page?.properties?.[name];
}

export function getPageTitle(page: any, titleProperty: string) {
	const prop = getPageProperty(page, titleProperty);
	if (!prop || prop.type !== "title") return "";
	return plainTextFromRichText(prop.title);
}

export function getPageSelect(page: any, propertyName: string) {
	const prop = getPageProperty(page, propertyName);
	if (!prop) return "";
	if (prop.type === "select") return prop.select?.name ?? "";
	if (prop.type === "status") return prop.status?.name ?? "";
	return "";
}

export function getPageEmail(page: any, propertyName: string) {
	const prop = getPageProperty(page, propertyName);
	if (!prop || prop.type !== "email") return "";
	return prop.email ?? "";
}

export function getPageRichText(page: any, propertyName: string) {
	const prop = getPageProperty(page, propertyName);
	if (!prop) return "";
	if (prop.type === "rich_text") return plainTextFromRichText(prop.rich_text);
	if (prop.type === "title") return plainTextFromRichText(prop.title);
	return "";
}

export function mapSupportTicket(page: any) {
	const config = getSupportConfig();
	return {
		id: page?.id ?? "",
		title: getPageTitle(page, config.properties.title),
		status: getPageSelect(page, config.properties.status),
		issueType: getPageSelect(page, config.properties.issueType),
		issueArea: getPageSelect(page, config.properties.issueArea),
		subject: getPageRichText(page, config.properties.subject),
		details: getPageRichText(page, config.properties.details),
		references: getPageRichText(page, config.properties.references),
		createdTime: page?.created_time ?? "",
		updatedTime: page?.last_edited_time ?? "",
		url: page?.url ?? "",
	};
}
