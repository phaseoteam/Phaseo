import { XMLParser } from "fast-xml-parser";
import { cacheLife, cacheTag } from "next/cache";

export type ProviderPriority = "critical" | "high" | "medium" | "info";

export type ProviderIncident = {
	id: string;
	title: string;
	link: string;
	status: string;
	impact?: string;
	description?: string;
	updatedAt?: string;
	publishedAt?: string;
	priority?: ProviderPriority;
};

export type ProviderStatus = {
	name: string;
	statusPageUrl: string;
	hasIssues: boolean;
	incidents: ProviderIncident[];
	lastChecked?: string;
	error?: string;
	unsupported?: boolean;
};

type AnthropicIncident = {
	id: string;
	name: string;
	status: string;
	created_at: string;
	updated_at: string;
	impact: string;
	shortlink: string;
	incident_updates?: Array<{
		body: string;
	}>;
};

type AnthropicSummary = {
	incidents: AnthropicIncident[];
};

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "",
	trimValues: true,
	parseTagValue: true,
});

const resolvedStatuses = new Set(["resolved", "operational"]);
const STATUS_REVALIDATE_SECONDS = 60 * 10;

const normalizeStatus = (value?: unknown) => {
	if (!value) {
		return "";
	}

	return String(value).trim().toLowerCase();
};

const extractStatusFromDescription = (description?: string) => {
	if (!description) return "";
	const match = description.match(/Status:\s*([^<\n]+)/i);
	return match ? normalizeStatus(match[1]) : "";
};

const extractSeverityFromDescription = (description?: string) => {
	if (!description) return "";
	const match = description.match(/<p>Severity:\s*([^<]+)<\/p>/i);
	return match ? normalizeStatus(match[1]) : "";
};

const tryExtractGuid = (item: Record<string, unknown>, idx: number) => {
	const guid = item.guid;

	if (typeof guid === "string") {
		return guid;
	}

	if (typeof guid === "object" && guid !== null) {
		const guidObj = guid as Record<string, unknown>;

		if ("#text" in guidObj) {
			return String(guidObj["#text"]);
		}

		if ("_" in guidObj) {
			return String(guidObj["_"]);
		}
	}

	if (item.link && typeof item.link === "string") {
		return item.link;
	}

	return `${item.title ?? "incident"}-${idx}`;
};

const mapItemToIncident = (
	item: Record<string, unknown>,
	index: number
): ProviderIncident => {
	const title = String(item.title ?? "Status update");
	const link = typeof item.link === "string" ? item.link : "";
	const description =
		typeof item.description === "string"
			? item.description
			: typeof item["content:encoded"] === "string"
				? item["content:encoded"]
				: undefined;
	const status = normalizeStatus(
		item["cb:status"] ??
		item.status ??
		extractStatusFromDescription(description) ??
		item.category
	);
	return {
		id: tryExtractGuid(item, index),
		title,
		link: link || "",
		status,
		impact: (typeof item["cb:impact"] === "string" ? item["cb:impact"] : undefined) || extractSeverityFromDescription(description),
		description,
		updatedAt:
			typeof item["cb:updatedAt"] === "string"
				? item["cb:updatedAt"]
				: typeof item.updated === "string"
					? item.updated
					: undefined,
		publishedAt:
			typeof item.pubDate === "string"
				? item.pubDate
				: typeof item["dc:date"] === "string"
					? item["dc:date"]
					: undefined,
	};
};

const extractItemsFromFeed = (xml: string) => {
	const parsed = parser.parse(xml);
	const channel = parsed?.rss?.channel;
	const items = channel?.item;

	if (!items) {
		return [];
	}

	return Array.isArray(items) ? items : [items];
};

const hasActiveIncident = (status: string) =>
	status.length > 0 && !resolvedStatuses.has(status);

async function fetchOpenAIStatus(): Promise<ProviderStatus> {
	const name = "OpenAI";
	const statusPageUrl = "https://status.openai.com/";
	const feedUrl = "https://status.openai.com/feed.rss";

	try {
		const response = await fetch(feedUrl, {
			next: { revalidate: STATUS_REVALIDATE_SECONDS },
		});

		if (!response.ok) {
			throw new Error(`Feed request failed (${response.status})`);
		}

		const text = await response.text();
		const items = extractItemsFromFeed(text);
		const incidents = items
			.map((item, index) => mapItemToIncident(item, index))
			.filter((incident) => hasActiveIncident(incident.status));

		return {
			name,
			statusPageUrl,
			hasIssues: incidents.length > 0,
			incidents,
			lastChecked: new Date().toISOString(),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			name,
			statusPageUrl,
			hasIssues: true,
			incidents: [],
			error: message,
		};
	}
}

async function fetchAnthropicStatus(): Promise<ProviderStatus> {
	const name = "Anthropic";
	const statusPageUrl = "https://status.claude.com/";
	const feedUrl = "https://status.claude.com/api/v2/summary.json";

	try {
		const response = await fetch(feedUrl, {
			next: { revalidate: STATUS_REVALIDATE_SECONDS },
		});

		if (!response.ok) {
			throw new Error(`Feed request failed (${response.status})`);
		}

		const text = await response.text();
		const data: AnthropicSummary = JSON.parse(text);
		const incidents = data.incidents.map((incident: AnthropicIncident) => ({
			id: incident.id,
			title: incident.name,
			link: incident.shortlink,
			status: incident.status,
			impact: incident.impact,
			description: incident.incident_updates?.[0]?.body,
			updatedAt: incident.updated_at,
			publishedAt: incident.created_at,
		})).filter((incident) => hasActiveIncident(incident.status));

		return {
			name,
			statusPageUrl,
			hasIssues: incidents.length > 0,
			incidents,
			lastChecked: new Date().toISOString(),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			name,
			statusPageUrl,
			hasIssues: true,
			incidents: [],
			error: message,
		};
	}
}

async function fetchXAIStatus(): Promise<ProviderStatus> {
	const name = "xAI";
	const statusPageUrl = "https://status.x.ai/";
	const feedUrl = "https://status.x.ai/feed.xml";

	try {
		const response = await fetch(feedUrl, {
			next: { revalidate: STATUS_REVALIDATE_SECONDS },
		});

		if (!response.ok) {
			throw new Error(`Feed request failed (${response.status})`);
		}

		const text = await response.text();
		const items = extractItemsFromFeed(text);
		const incidents = items
			.map((item, index) => mapItemToIncident(item, index))
			.filter((incident) => hasActiveIncident(incident.status));

		return {
			name,
			statusPageUrl,
			hasIssues: incidents.length > 0,
			incidents,
			lastChecked: new Date().toISOString(),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			name,
			statusPageUrl,
			hasIssues: true,
			incidents: [],
			error: message,
		};
	}
}

export async function getProviderStatuses() {
	"use cache";
	cacheLife("minutes");
	cacheTag("providers:status");
	return Promise.all([fetchOpenAIStatus(), fetchAnthropicStatus(), fetchXAIStatus()]);
}
