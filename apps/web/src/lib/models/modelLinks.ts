/**
 * Model links: a URL, a display title and a kind from a short fixed list.
 *
 * The title is what people see. The kind only groups a link, picks its fallback icon and fills
 * the comparison columns. The list mirrors the `v2_model_links_link_kind_check` constraint and
 * `apps/web-api/src/models/modelLinkKinds.ts`; keep the three in step.
 */
export const MODEL_LINK_KINDS = [
	"announcement",
	"model_card",
	"paper",
	"weights",
	"repository",
	"documentation",
	"api_reference",
	"playground",
	"pricing",
	"benchmark",
	"website",
	"provider",
	"deprecation",
	"license",
] as const;

export type ModelLinkKind = (typeof MODEL_LINK_KINDS)[number];

const KIND_SET = new Set<string>(MODEL_LINK_KINDS);

/** Older kind names still found in imports and payloads, and the kind each one became. */
const LEGACY_KIND_ALIASES: Record<string, ModelLinkKind> = {
	release: "announcement",
	release_notes: "announcement",
	news: "announcement",
	event: "announcement",
	blog: "announcement",
	api: "api_reference",
	docs: "documentation",
	guide: "documentation",
	usage: "documentation",
	privacy: "documentation",
	official_model_card: "model_card",
	system_card: "model_card",
	hugging_face: "weights",
	github: "repository",
	provider_model: "provider",
	provider_models: "provider",
	provider_endpoint: "provider",
	catalogue: "provider",
	official_pricing: "pricing",
	homepage: "website",
	official_website: "website",
};

export function isModelLinkKind(value: unknown): value is ModelLinkKind {
	return typeof value === "string" && KIND_SET.has(value);
}

function hostOf(url: string): string | null {
	try {
		return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}

function pathSegments(url: string): string[] {
	try {
		return new URL(url.trim()).pathname.split("/").filter(Boolean);
	} catch {
		return [];
	}
}

function pathOf(url: string): string {
	return `/${pathSegments(url).join("/")}`.toLowerCase();
}

/**
 * Guesses a kind from a URL, so a pasted link starts with a sensible kind. People can change it.
 */
export function detectModelLinkKind(url: string): ModelLinkKind {
	const host = hostOf(url);
	if (!host) return "website";
	const path = pathOf(url);
	if (host === "huggingface.co" || host.endsWith(".huggingface.co")) {
		return path.startsWith("/spaces/") ? "playground" : "weights";
	}
	if (host === "github.com" || host === "gitlab.com") return "repository";
	if (host === "arxiv.org" || host.endsWith(".arxiv.org") || path.endsWith(".pdf")) return "paper";
	if (/model[-_]?card|system[-_]?card/.test(path)) return "model_card";
	if (/(^|\/)pricing(\/|$)/.test(path)) return "pricing";
	if (/(^|\/)(playground|chat|studio)(\/|$)/.test(path) || host.startsWith("playground.") || host.startsWith("studio.")) {
		return "playground";
	}
	if (/(^|\/)api[-_]?reference(\/|$)/.test(path)) return "api_reference";
	if (host.startsWith("docs.") || host.startsWith("developers.") || /(^|\/)docs?(\/|$)/.test(path)) return "documentation";
	if (/(^|\/)(blog|news|announcements?|research|index)(\/|$)/.test(path) || host === "x.com" || host === "twitter.com") {
		return "announcement";
	}
	return "website";
}

/**
 * Maps any kind string, including the older names, onto the fixed list. Unknown kinds fall back to
 * the kind detected from the URL.
 */
export function normaliseModelLinkKind(input: unknown, url = ""): ModelLinkKind {
	const value = typeof input === "string"
		? input.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]+/g, "")
		: "";
	if (isModelLinkKind(value)) return value;
	if (value === "source") return hostOf(url) === "github.com" ? "repository" : "announcement";
	if (value === "model") return detectModelLinkKind(url) === "weights" ? "weights" : "provider";
	return LEGACY_KIND_ALIASES[value] ?? detectModelLinkKind(url);
}

const SITE_NAMES: Record<string, string> = {
	"huggingface.co": "Hugging Face",
	"github.com": "GitHub",
	"gitlab.com": "GitLab",
	"arxiv.org": "arXiv",
	"x.com": "X",
	"twitter.com": "X",
};

const KIND_TITLES: Record<ModelLinkKind, string> = {
	announcement: "Announcement",
	model_card: "Model card",
	paper: "Paper",
	weights: "Weights",
	repository: "Repository",
	documentation: "Documentation",
	api_reference: "API reference",
	playground: "Playground",
	pricing: "Pricing",
	benchmark: "Benchmark",
	website: "Website",
	provider: "Provider",
	deprecation: "Deprecation notice",
	license: "Licence",
};

/**
 * A starting title for a pasted link, for example "Inkling-2-Small on Hugging Face". Titles are
 * stored as written, so this is only a suggestion for the editor.
 */
export function suggestModelLinkTitle(url: string, kind: ModelLinkKind): string {
	const host = hostOf(url);
	const site = host ? SITE_NAMES[host] : undefined;
	if (site && (kind === "weights" || kind === "repository" || kind === "playground")) {
		// Hugging Face and GitHub paths are owner/name (Spaces add a "spaces" prefix); keep the
		// name's original capitalisation.
		const segments = pathSegments(url);
		if (segments[0]?.toLowerCase() === "spaces") segments.shift();
		const name = segments[1];
		if (name) return `${name} on ${site}`;
	}
	if (site && kind === "paper") return `Paper on ${site}`;
	return KIND_TITLES[kind];
}

export function defaultModelLinkTitle(kind: ModelLinkKind): string {
	return KIND_TITLES[kind];
}

/**
 * The key two links must share to count as the same URL. Only the scheme and host are
 * case-insensitive, so only they are lowercased (the URL parser does this); the path, query and
 * fragment are kept exactly. "https://a.com" and "https://a.com/" share a key because the parser
 * gives both the path "/".
 */
export function modelLinkUrlKey(url: string | null | undefined): string {
	const trimmed = url?.trim() ?? "";
	if (!trimmed) return "";
	try {
		return new URL(trimmed).href;
	} catch {
		return trimmed;
	}
}

/** Keeps the first link for each URL, so one URL saved under several kinds shows once. */
export function dedupeModelLinksByUrl<T extends { url?: string | null }>(links: T[]): T[] {
	const seen = new Set<string>();
	return links.filter((link) => {
		const key = modelLinkUrlKey(link.url);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
