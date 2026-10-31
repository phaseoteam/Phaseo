import { it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModalityLeaderboardsServer, type RankingModality } from "./RankingsPageContent";
import { modalityLeaderboardsQuery } from "./RankingsPageContent.queries";
import { fetchFrontendRankingModalityTimeseries } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendRankingPeriodLeaderboard } from "@/lib/fetchers/frontend/fetchRankingSections";

vi.mock("@/i18n/react", () => ({
    useLocale: () => "en-GB",
    useTranslations: () => (key: string) => ({ usageTokensUnit: "tokens", usageImagesUnit: "images", usageSecondsUnit: "seconds" }[key] ?? key),
}));
vi.mock("@/lib/auth/localized-metadata", () => ({}));
vi.mock("@/lib/seo", () => ({}));
vi.mock("@/lib/fetchers/frontend/fetchRankingSections", () => ({ fetchFrontendRankingPeriodLeaderboard: vi.fn() }));
vi.mock("@/lib/fetchers/frontend/fetchPublicCatalog", () => ({
	fetchFrontendRankingModalityTimeseries: vi.fn(),
	fetchFrontendModelLeaderboardMetaByIds: vi.fn(async () => ({})),
}));
vi.mock("@/components/(rankings)/MarketShareStackedBar", () => ({}));
vi.mock("@/components/(rankings)/MarketShareLeaderboard", () => ({}));
vi.mock("@/components/(rankings)/UsageStackedBar", () => ({}));
vi.mock("@/components/(rankings)/RankingBarTable", () => ({}));
vi.mock("@/components/(rankings)/PublicGeography", () => ({}));
vi.mock("@/components/(rankings)/ToolCallsSection", () => ({}));
vi.mock("@/components/(rankings)/BenchmarkRankingsSectionServer", () => ({}));
vi.mock("@/components/(rankings)/ContextLengthSection", () => ({}));
vi.mock("@/components/(rankings)/ImageInputsSection", () => ({}));
vi.mock("@/components/(rankings)/ModelRetentionSection", () => ({}));
vi.mock("@/components/(rankings)/TopAppsSection", () => ({}));
vi.mock("@/components/(rankings)/RankingsModalityTabs", () => ({}));
vi.mock("@/components/(rankings)/RankingUnavailable", () => ({}));
vi.mock("@/components/(rankings)/Skeletons", () => ({}));
vi.mock("@/components/(rankings)/InlineInfoTooltip", () => ({}));
vi.mock("@/components/(data)/model/ModelPageToc", () => ({}));
vi.mock("@/components/(rankings)/ModalityLeaderboards", () => ({ ModalityLeaderboards: () => null }));

type Sections = ReactElement<{ sections: Array<Record<string, any>> }>;

// Load the section's query as the route loader does, then call the section
// inside a render so its hooks run, and return the element it renders.
async function loadSections(modality: RankingModality): Promise<Sections> {
	const queryClient = new QueryClient();
	await queryClient.prefetchQuery(modalityLeaderboardsQuery(modality));
	let result!: Sections;
	function Capture() {
		result = ModalityLeaderboardsServer({ modality }) as Sections;
		return null;
	}
	renderToStaticMarkup(<QueryClientProvider client={queryClient}><Capture /></QueryClientProvider>);
	return result;
}

const fetchSeries = vi.mocked(fetchFrontendRankingModalityTimeseries);
const fetchPeriod = vi.mocked(fetchFrontendRankingPeriodLeaderboard);
beforeEach(() => {
	fetchPeriod.mockReset();
	fetchPeriod.mockResolvedValue({ data: [{ model_id: "lab/model", current: 9, previous: 3 }],
		period: { start: "2026-09-05T12:00:00Z", end: "2026-10-05T12:00:00Z", previousStart: "2026-08-06T12:00:00Z" } });
	fetchSeries.mockReset();
	fetchSeries.mockResolvedValue({ data: [
		{ bucket: "2026-09-07T00:00:00Z", model_id: "lab/model", requests: 1, tokens: 2.75 },
		{ bucket: "2026-09-14T00:00:00Z", model_id: "lab/model", requests: 1, tokens: 3.25 },
	] });
});

it.each([
	["text", "text_tokens", "tokens"], ["image", "image_outputs", "images"],
	["embeddings", "embedding_tokens", "tokens"], ["rerank", "rerank_quad_tokens", "quadtokens"],
	["audio", "audio_tokens", "tokens"], ["video", "video_seconds", "seconds"],
	["speech", "speech_seconds", "seconds"], ["transcription", "transcription_seconds", "seconds"],
])("loads %s rankings with matching chart and leaderboard units", async (modality, metric, unit) => {
	const result = await loadSections(modality as RankingModality);
	const section = result.props.sections[0];
	expect(fetchSeries).toHaveBeenCalledWith(metric, "year");
	expect(fetchPeriod).toHaveBeenCalledWith(metric, 30);
	expect(fetchSeries).toHaveBeenCalledTimes(1);
	expect(section.valueUnit).toBe(unit);
	expect(section.primaryTimeseries).toHaveLength(2);
	expect(section.metrics[0].entries[0]).toMatchObject({ model_id: "lab/model", value: 9, value_label: `9 ${unit}` });
});

it("keeps successful monthly data when the weekly chart fetch fails", async () => {
	fetchSeries.mockRejectedValueOnce(new Error("unavailable"));
	const result = await loadSections("speech");
	const section = result.props.sections[0];
	expect(section.unavailable).toBe(true);
	expect(section.metrics[0].unavailable).toBe(false);
	expect(section.metrics[0].entries).toHaveLength(1);
});

it("distinguishes a successful empty result from an unavailable ranking", async () => {
	fetchSeries.mockResolvedValue({ data: [] });
	const result = await loadSections("transcription");
	expect(result.props.sections[0]).toMatchObject({ unavailable: false, primaryTimeseries: [] });
});
