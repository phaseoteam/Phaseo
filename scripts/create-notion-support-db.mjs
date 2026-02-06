import fs from "fs";
import path from "path";

const DEFAULT_DB_NAME = "AI Stats Support";
const ISSUE_TYPES = [
	"Billing or account issue",
	"Bug or outage",
	"Data or metrics issue",
	"Docs or integration question",
	"Feature request",
	"General question",
	"Community or quick feedback",
];
const ISSUE_AREAS = [
	"Web app",
	"Gateway",
	"SDKs",
	"REST API",
	"Billing & payments",
	"Data / rankings",
	"Docs",
	"Other",
];
const CUSTOMER_TYPES = [
	"Enterprise",
	"Team",
	"Pro",
	"Free",
	"Open source",
	"Prospect",
	"Not sure",
];
const STATUS_OPTIONS = [
	{ name: "New", color: "blue" },
	{ name: "In progress", color: "yellow" },
	{ name: "Waiting on customer", color: "orange" },
	{ name: "Resolved", color: "green" },
];

function readEnvFile(envPath) {
	if (!fs.existsSync(envPath)) return {};
	const raw = fs.readFileSync(envPath, "utf8");
	const lines = raw.split(/\r?\n/);
	const env = {};
	for (const line of lines) {
		if (!line || line.trim().startsWith("#")) continue;
		const idx = line.indexOf("=");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if (
			(value.startsWith("\"") && value.endsWith("\"")) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

function writeEnvValue(envPath, key, value) {
	const line = `${key}="${value}"`;
	if (!fs.existsSync(envPath)) {
		fs.writeFileSync(envPath, `${line}\n`, "utf8");
		return;
	}

	const raw = fs.readFileSync(envPath, "utf8");
	const lines = raw.split(/\r?\n/);
	let replaced = false;
	const nextLines = lines.map((current) => {
		if (current.startsWith(`${key}=`)) {
			replaced = true;
			return line;
		}
		return current;
	});

	if (!replaced) {
		nextLines.push(line);
	}

	fs.writeFileSync(envPath, nextLines.join("\n"), "utf8");
}

function extractPageId(value) {
	if (!value) return null;
	const match = value.match(/[0-9a-f]{32}/i);
	if (match) return match[0];
	const clean = value.replace(/-/g, "");
	return clean.length === 32 ? clean : null;
}

const args = process.argv.slice(2);
const parentInput = args[0] || process.env.NOTION_SUPPORT_PARENT_PAGE_ID || "";
const dbName = args[1] || process.env.NOTION_SUPPORT_DATABASE_NAME || DEFAULT_DB_NAME;
const parentPageId = extractPageId(parentInput);

if (!parentPageId) {
	console.error("Missing parent page ID or URL.");
	process.exit(1);
}

const envPath = path.join(process.cwd(), ".env.local");
const fileEnv = readEnvFile(envPath);
const notionKey =
	process.env.NOTION_INTEGRATION_SECRET ||
	process.env.NOTION_API_KEY ||
	fileEnv.NOTION_INTEGRATION_SECRET ||
	fileEnv.NOTION_API_KEY;

if (!notionKey) {
	console.error("Missing NOTION_INTEGRATION_SECRET in environment or .env.local");
	process.exit(1);
}

const notionVersion = process.env.NOTION_API_VERSION || "2022-06-28";

const properties = {
	Name: { title: {} },
	Requester: { rich_text: {} },
	Email: { email: {} },
	"Issue Type": {
		select: {
			options: ISSUE_TYPES.map((name) => ({ name })),
		},
	},
	"Issue Area": {
		select: {
			options: ISSUE_AREAS.map((name) => ({ name })),
		},
	},
	"Customer Type": {
		select: {
			options: CUSTOMER_TYPES.map((name) => ({ name })),
		},
	},
	Subject: { rich_text: {} },
	Details: { rich_text: {} },
	References: { rich_text: {} },
	"Contact Methods": { rich_text: {} },
	Attachments: { files: {} },
	Status: {
		select: {
			options: STATUS_OPTIONS,
		},
	},
	"Internal ID": { rich_text: {} },
	"Account Link": { url: {} },
	"GitHub Link": { url: {} },
	"Linear Link": { url: {} },
	"Submitted At": { created_time: {} },
	Assignee: { people: {} },
};

const payload = {
	parent: { type: "page_id", page_id: parentPageId },
	title: [{ type: "text", text: { content: dbName } }],
	properties,
};

const response = await fetch("https://api.notion.com/v1/databases", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${notionKey}`,
		"Notion-Version": notionVersion,
	},
	body: JSON.stringify(payload),
});

if (!response.ok) {
	const body = await response.text().catch(() => "");
	console.error("Notion API error", response.status, body);
	process.exit(1);
}

const data = await response.json();
const databaseId = data?.id?.replace(/-/g, "");
if (!databaseId) {
	console.error("Notion did not return a database id");
	process.exit(1);
}

writeEnvValue(envPath, "NOTION_SUPPORT_DATABASE_ID", databaseId);
writeEnvValue(envPath, "NOTION_SUPPORT_STATUS_DEFAULT", "New");

console.log("Created Notion database:", data?.url || data?.id);
console.log("Saved NOTION_SUPPORT_DATABASE_ID to .env.local");
