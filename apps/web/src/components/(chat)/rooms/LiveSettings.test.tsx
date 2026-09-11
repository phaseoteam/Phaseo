import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_LIVE_SETTINGS, LIVE_VOICE_OPTIONS, LiveSettings, LiveUsageDetails } from "./LiveSettings";

describe("Live settings and usage", () => {
	it("offers all built-in voices without generating paid voice previews", () => {
		expect(new Set(LIVE_VOICE_OPTIONS.map((voice) => voice.id)).size).toBe(22);
		expect(LIVE_VOICE_OPTIONS).toEqual(expect.arrayContaining([
			expect.objectContaining({ id: "vesper", label: "Vesper" }),
			expect.objectContaining({ id: "willow", label: "Willow" }),
			expect.objectContaining({ id: "bossa", label: "Bossa" }),
		]));
	});
	it("describes documented Live voices without inventing profiles for the others", () => {
		expect(Object.fromEntries(LIVE_VOICE_OPTIONS.filter((voice) => voice.description)
			.map((voice) => [voice.id, voice.description]))).toEqual({
			beacon: "English · Filipino-influenced · Masculine",
			bossa: "Portuguese · Brazilian-influenced · Feminine",
			cinder: "English · Southern U.S.-influenced · Masculine",
			delta: "English · Southern U.S.-influenced · Feminine",
			gleam: "English · North American-influenced · Feminine",
			meridian: "English · North American-influenced · Masculine",
			quartz: "English · Australian-influenced · Feminine",
			ripple: "English · Australian-influenced · Masculine",
			stone: "English · Irish-influenced · Masculine",
			tempo: "Portuguese · Brazilian-influenced · Masculine",
			vesper: "English · British-influenced · Masculine",
			willow: "English · Irish-influenced · Feminine",
		});
	});
	it("renders labeled controls and describes the billing and next-session boundaries", () => {
		const html = renderToStaticMarkup(<LiveSettings value={DEFAULT_LIVE_SETTINGS} onChange={() => undefined} />);
		for (const label of ["Backend instructions", "Reasoning effort", "Reasoning summary", "Backend detail", "Service tier", "Output token limit", "Web search", "Parallel tool calls"]) expect(html).toContain(label);
		expect(html).toContain("Changes apply to the next session");
		expect(html).toContain("$0.01 per call");
		expect(html).toContain('max="32768"');
	});
	it("renders separately reported cache/reasoning/tool usage and delegated response status", () => {
		const html = renderToStaticMarkup(<LiveUsageDetails pending={1} usage={{ input_tokens: 1234, output_tokens: 250, output_reasoning_tokens: 100,
			cached_read_text_tokens: 500, cached_write_text_tokens: 50, native_web_search_requests: 2,
			live_responses: [{ id: "resp_test", status: "response.incomplete", service_tier: "priority", usage: { input_tokens: 1234, output_tokens: 250 } }] }} />);
		expect(html).toContain("1 running"); expect(html).toContain("Reasoning (included)"); expect(html).toContain("Cache writes");
		expect(html).toContain("resp_test"); expect(html).toContain("incomplete"); expect(html).toContain("priority");
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-label="Delegation usage details"');
		expect(html).toContain('data-slot="scroll-area"');
		expect(html).toContain('data-slot="scroll-area-viewport"');
		expect(html).not.toContain("<details");
		expect(html).not.toContain("<summary");
	});
});
