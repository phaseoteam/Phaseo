import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { OutputModalityChipRow } from "./OutputModalityChipRow";

jest.mock("motion/react", () => ({ useReducedMotion: () => false }));
jest.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({
		children,
		scrollBarClassName,
		viewportClassName,
	}: {
		children: ReactNode;
		scrollBarClassName?: string;
		viewportClassName?: string;
	}) => (
		<div data-scrollbar={scrollBarClassName} data-viewport={viewportClassName}>
			{children}
		</div>
	),
}));

const Icon = (() => <svg />) as unknown as LucideIcon;

const LABELS: Record<string, string> = {
	text: "Text",
	image: "Image",
	audio: "Audio",
	embeddings: "Embeddings",
	documents: "Documents",
	audio_tts: "Speech",
	audio_stt: "Transcription",
	translation: "Translation",
	realtime: "Realtime",
	audio_music: "Music",
};

const MAIN = ["text", "image", "audio", "embeddings", "documents"];
// Deliberately out of order: the row must lay the sub-types out itself.
const SUBS = ["audio_music", "audio_stt", "translation", "audio_tts", "realtime"];

const options = (values: string[]) =>
	values.map((value, index) => ({ value, count: 10 + index }));

function render(selected: string[], values = [...MAIN, ...SUBS]) {
	const html = renderToStaticMarkup(
		<OutputModalityChipRow
			options={options(values)}
			selected={selected}
			onChange={() => undefined}
			labelForValue={(value) => LABELS[value] ?? value}
			iconForValue={() => Icon}
		/>,
	);
	const [, main, audio] = html.split("col-start-1 row-start-1");
	return { html, main: main ?? "", audio: audio ?? "" };
}

const labelsIn = (markup: string) =>
	Object.values(LABELS).filter((label) => markup.includes(`<span>${label}</span>`));

describe("OutputModalityChipRow", () => {
	it("shows the main chips, with Audio collapsed, until Audio is pressed", () => {
		const { main, audio } = render([]);
		expect(main).toContain("visibility:visible");
		expect(main).toContain('aria-hidden="false"');
		expect(labelsIn(main)).toEqual(["Text", "Image", "Audio", "Embeddings", "Documents"]);
		expect(main).toContain('aria-expanded="false"');
		expect(audio).toContain("visibility:hidden");
		expect(audio).toContain('aria-hidden="true"');
	});

	it("swaps to the audio row, with Audio as the way back, once Audio is selected", () => {
		const { main, audio } = render(["audio"]);
		expect(main).toContain("visibility:hidden");
		expect(main).toContain('aria-hidden="true"');
		expect(audio).toContain("visibility:visible");
		expect(audio).toContain('aria-hidden="false"');
		expect(audio).toContain('aria-expanded="true"');
		expect(labelsIn(audio)).toEqual([
			"Audio",
			"Speech",
			"Transcription",
			"Translation",
			"Realtime",
			"Music",
		]);
		expect(audio).not.toMatch(/>\+\d+</);
	});

	it("keeps the audio row open when a sub-type is selected and marks only that sub-type", () => {
		const { main, audio } = render(["audio_stt"]);
		expect(main).toContain("visibility:hidden");
		expect(audio).toContain("visibility:visible");
		const transcription = audio.split("<span>Transcription</span>")[0].split("<button").pop() ?? "";
		const speech = audio.split("<span>Speech</span>")[0].split("<button").pop() ?? "";
		expect(transcription).toContain('aria-pressed="true"');
		expect(speech).toContain('aria-pressed="false"');
	});

	it("flags filters on other chips that are hidden while the audio row is open", () => {
		expect(render(["text", "audio_stt"]).audio).toMatch(/>\+1</);
		expect(render(["text", "embeddings", "audio"]).audio).toMatch(/>\+2</);
	});

	it("hides the scrollbar in the audio row but keeps it for the main row", () => {
		// Touch screens never get it; the row has edge fades there instead.
		const scrollbarHidden = (html: string) => /data-scrollbar="hidden /.test(html);
		expect(scrollbarHidden(render([]).html)).toBe(false);
		expect(scrollbarHidden(render(["audio"]).html)).toBe(true);
		expect(scrollbarHidden(render(["audio_music"]).html)).toBe(true);
		// Audio is a plain chip without sub-types, so the row never swaps.
		expect(scrollbarHidden(render(["audio"], MAIN).html)).toBe(false);
	});

	it("keeps swipes on the row from scrolling the page or navigating back", () => {
		for (const selected of [[], ["audio"]]) {
			const { html } = render(selected);
			expect(html).toMatch(/data-viewport="[^"]*overflow-y-hidden!/);
			expect(html).toMatch(/data-viewport="[^"]*overscroll-x-contain/);
		}
	});

	it("swaps the scrollbar for edge fades on touch screens", () => {
		for (const selected of [[], ["audio"]]) {
			const { html } = render(selected);
			expect(html).toMatch(/data-scrollbar="[^"]*pointer-coarse:hidden/);
			expect(html).toMatch(/data-viewport="[^"]*pointer-coarse:pb-0/);
			expect(html).toMatch(
				/data-viewport="[^"]*pointer-coarse:\[mask-image:linear-gradient\([^"]*--scroll-area-overflow-x-start[^"]*--scroll-area-overflow-x-end/,
			);
		}
	});

	it("drops counts from unselected chips on phones so Audio fits on screen", () => {
		const { main } = render(["text"]);
		const countClass = (label: string) =>
			main.match(new RegExp(`<span>${label}</span><span class="([^"]*)"`))?.[1] ?? "";
		expect(countClass("Text")).not.toContain("max-sm:hidden");
		expect(countClass("Image")).toContain("max-sm:hidden");
		expect(countClass("Audio")).toContain("max-sm:hidden");
	});

	it("swaps quickly, with every chip moving together and no stagger", () => {
		const { main, audio } = render(["audio"]);
		expect(main).toContain("150ms, 150ms, 110ms, 110ms");
		expect(audio).toContain("150ms, 150ms, 160ms, 160ms");
		// Only the rows' visibility switch has a delay, never an individual chip.
		const chipDelays = `${main}${audio}`.match(/transition-delay:[^;"]*/g) ?? [];
		expect(chipDelays.every((value) => !value.includes(", "))).toBe(true);
	});

	it("keeps sub-type chips out of the main row", () => {
		const { main } = render([]);
		for (const label of ["Speech", "Transcription", "Translation", "Realtime", "Music"]) {
			expect(main).not.toContain(`<span>${label}</span>`);
		}
	});

	it("treats Audio as a plain chip when no sub-types have options", () => {
		const { html, main, audio } = render(["audio"], MAIN);
		expect(audio).toBe("");
		expect(main).toContain("visibility:visible");
		expect(main).not.toMatch(/aria-expanded="/);
		const audioChip = html.split("<span>Audio</span>")[0].split("<button").pop() ?? "";
		expect(audioChip).toContain('aria-pressed="true"');
	});

	it("renders nothing without options", () => {
		expect(render([], []).html).toBe("");
	});
});
