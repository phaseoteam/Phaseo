export interface UTMOptions {
	source?: string;
	medium?: string;
	campaign: string;
	content?: string;
	term?: string;
}

const DEFAULT_SOURCE = "phaseo";
const DEFAULT_MEDIUM = "referral";

export function withUTM(url: string, options: UTMOptions): string {
	try {
		const resolved = new URL(url);
		const { source = DEFAULT_SOURCE, medium = DEFAULT_MEDIUM, campaign, content, term } =
			options;

		resolved.searchParams.set("utm_source", source);
		resolved.searchParams.set("utm_medium", medium);
		if (campaign) resolved.searchParams.set("utm_campaign", campaign);
		if (content) resolved.searchParams.set("utm_content", content);
		if (term) resolved.searchParams.set("utm_term", term);

		return resolved.toString();
	} catch {
		return url;
	}
}
