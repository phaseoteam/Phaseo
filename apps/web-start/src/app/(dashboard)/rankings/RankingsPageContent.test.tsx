import { ModalityLeaderboardsServer, type RankingModality } from "@/app/[locale]/(dashboard)/rankings/RankingsPageContent";
import { fetchFrontendRankingModalityTimeseries } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendRankingPeriodLeaderboard } from "@/lib/fetchers/frontend/fetchRankingSections";

jest.mock("next-intl/server", () => ({
    getLocale: jest.fn(async () => "en-GB"),
    getTranslations: jest.fn(async () => (key: string) => ({ usageTokensUnit: "tokens", usageImagesUnit: "images", usageSecondsUnit: "seconds" }[key] ?? key)),
}));
jest.mock("@/lib/auth/localized-metadata", () => ({}));
jest.mock("@/lib/seo", () => ({}));
jest.mock("@/lib/fetchers/frontend/fetchRankingSections", () => ({ fetchFrontendRankingPeriodLeaderboard: jest.fn() }));
jest.mock("@/lib/fetchers/frontend/fetchPublicCatalog", () => ({
	fetchFrontendRankingModalityTimeseries: jest.fn(),
	fetchFrontendModelLeaderboardMetaByIds: jest.fn(async () => ({})),
}));
jest.mock("@/components/(rankings)/MarketShareStackedBar", () => ({}));
jest.mock("@/components/(rankings)/MarketShareLeaderboard", () => ({}));
jest.mock("@/components/(rankings)/UsageStackedBar", () => ({}));
jest.mock("@/components/(rankings)/RankingBarTable", () => ({}));
jest.mock("@/components/(rankings)/PublicGeography", () => ({}));
jest.mock("@/components/(rankings)/ToolCallsSection", () => ({}));
jest.mock("@/components/(rankings)/BenchmarkRankingsSectionServer", () => ({}));
jest.mock("@/components/(rankings)/ContextLengthSection", () => ({}));
jest.mock("@/components/(rankings)/ImageInputsSection", () => ({}));
jest.mock("@/components/(rankings)/ModelRetentionSection", () => ({}));
jest.mock("@/components/(rankings)/TopAppsSection", () => ({}));
jest.mock("@/components/(rankings)/RankingsModalityTabs", () => ({}));
jest.mock("@/components/(rankings)/RankingUnavailable", () => ({}));
jest.mock("@/components/(rankings)/Skeletons", () => ({}));
jest.mock("@/components/(rankings)/InlineInfoTooltip", () => ({}));
jest.mock("@/components/(data)/model/ModelPageToc", () => ({}));
jest.mock("@/components/(rankings)/ModalityLeaderboards", () => ({ ModalityLeaderboards: () => null }));

const fetchSeries = jest.mocked(fetchFrontendRankingModalityTimeseries);
const fetchPeriod = jest.mocked(fetchFrontendRankingPeriodLeaderboard);
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
	const result = await ModalityLeaderboardsServer({ modality: modality as RankingModality });
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
	const result = await ModalityLeaderboardsServer({ modality: "speech" });
	const section = result.props.sections[0];
	expect(section.unavailable).toBe(true);
	expect(section.metrics[0].unavailable).toBe(false);
	expect(section.metrics[0].entries).toHaveLength(1);
});

it("distinguishes a successful empty result from an unavailable ranking", async () => {
	fetchSeries.mockResolvedValue({ data: [] });
	const result = await ModalityLeaderboardsServer({ modality: "transcription" });
	expect(result.props.sections[0]).toMatchObject({ unavailable: false, primaryTimeseries: [] });
});
