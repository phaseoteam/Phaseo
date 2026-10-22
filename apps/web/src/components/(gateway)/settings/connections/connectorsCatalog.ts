// Remote MCP servers that let Phaseo register itself, so anyone can connect
// them without an admin setting up an app first. Checked 2026-10-21: each URL
// answers with protected resource metadata and supports dynamic registration.
// Any other server can still be added by URL.

export type Connector = {
	id: string;
	name: string;
	serverUrl: string;
	/** Key under SettingsUI.connections.notes, for servers that need something first. */
	note?: "atlassianAdmin";
};

export const CONNECTORS: Connector[] = [
	{ id: "linear", name: "Linear", serverUrl: "https://mcp.linear.app/mcp" },
	{ id: "notion", name: "Notion", serverUrl: "https://mcp.notion.com/mcp" },
	{ id: "sentry", name: "Sentry", serverUrl: "https://mcp.sentry.dev/mcp" },
	{ id: "stripe", name: "Stripe", serverUrl: "https://mcp.stripe.com" },
	{ id: "supabase", name: "Supabase", serverUrl: "https://mcp.supabase.com/mcp" },
	{ id: "cloudflare", name: "Cloudflare", serverUrl: "https://mcp.cloudflare.com/mcp" },
	{ id: "airtable", name: "Airtable", serverUrl: "https://mcp.airtable.com/mcp" },
	{ id: "atlassian", name: "Atlassian", serverUrl: "https://mcp.atlassian.com/v1/mcp", note: "atlassianAdmin" },
];
