import { absoluteUrl } from "@/lib/seo";
import { withUTM } from "@/lib/utm";

export const CHART_SHARE_PARAM = "chart";

export type ChartShareChannel = "x" | "linkedin" | "copy_link" | "native" | "download" | "copy_image";

/** Which page family a shared chart came from; also the UTM campaign. */
export type ChartShareCampaign = "model_chart" | "rankings_chart";

/** Chart settings that the shared link restores, so readers see the chart in the image. */
export type ChartShareState = Record<string, string | null | undefined>;

export type ChartShareTarget = {
	/** Page path without locale, such as `/models/openai/gpt-6.1-terra` or `/rankings`. */
	path: string;
	/** Page section the chart lives in, used as the URL hash. */
	section: string;
	/** Stable chart key, such as `pricing-history` or `top-models`. */
	chartId: string;
	campaign: ChartShareCampaign;
	state?: ChartShareState;
};

const LINK_CHANNELS: Record<ChartShareChannel, string> = {
	x: "x",
	linkedin: "linkedin",
	copy_link: "copy_link",
	native: "native_share",
	download: "download",
	copy_image: "copy_image",
};

/** A calendar date for a shared link (YYYY-MM-DD), from the reader's local date. */
export function toShareDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Reads a YYYY-MM-DD link value back as a local date; anything else is ignored. */
export function fromShareDate(value: string | null): Date | undefined {
	const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** Builds the page link for a chart, keeping its settings and tagging the channel. */
export function buildChartShareUrl(target: ChartShareTarget, channel: ChartShareChannel): string {
	const url = new URL(absoluteUrl(target.path));
	url.searchParams.set(CHART_SHARE_PARAM, target.chartId);
	for (const [key, value] of Object.entries(target.state ?? {})) {
		if (value != null && value !== "") url.searchParams.set(key, value);
	}
	url.hash = target.section;
	return withUTM(url.toString(), {
		source: "share",
		medium: LINK_CHANNELS[channel],
		campaign: target.campaign,
		content: target.chartId,
	});
}

/** Footer text for the image, such as `phaseo.app/rankings`. Always the public host, also in local dev and previews. */
export function displayChartPath(path: string): string {
	return `phaseo.app${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildChartShareFileName(target: Pick<ChartShareTarget, "path" | "chartId">): string {
	const slug = `${target.path.replace(/^\/+/, "")}-${target.chartId}`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/-+/g, "-");
	return `phaseo-${slug}.png`;
}

/** Reads a shared chart's settings from the current URL, if the link was for this chart. */
export function readSharedChartState(search: string, chartId: string): URLSearchParams | null {
	const params = new URLSearchParams(search);
	return params.get(CHART_SHARE_PARAM) === chartId ? params : null;
}
