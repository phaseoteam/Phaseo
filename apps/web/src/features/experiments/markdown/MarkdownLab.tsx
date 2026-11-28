"use client";

import { Profiler, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatAnswerMarkdown } from "@/components/(chat)/openui/ChatAnswerContent";
import { WordsMarkdown } from "@/components/markdown/words/WordsMarkdown";
import { chipMarkdown } from "@phaseo/app-kit/message-chips-markdown";
import { normalizeChatMarkdown } from "@/components/(chat)/chatMarkdown";

/** `words-plain` is Words without chips or preprocessing, to separate Words' own cost from the chip layer. */
type MarkdownEngine = "streamdown" | "words" | "words-plain";
import { markdownFixtures, type MarkdownFixture } from "./fixtures";
import { useTranslations } from "@/i18n/react";

type BenchResult = {
	engine: MarkdownEngine;
	/** chipMarkdown(normalizeChatMarkdown()) on every prefix, the preprocessing the Words chat path does per update. */
	preprocessMs?: number;
	fixture: MarkdownFixture;
	chars: number;
	chunk: number;
	updates: number;
	/** Wall time spent inside synchronous updates (render + commit + layout effects). */
	updateMs: number;
	/** React's own measure of render work. */
	reactMs: number;
	maxUpdateMs: number;
	longTasks: number;
	longTaskMs: number;
	heapDeltaMb?: number;
	finalHtmlKb: number;
	xss: number;
};

declare global {
	interface Window { __mdBench?: BenchResult[]; __mdXss?: number; __mdRun?: (engine: MarkdownEngine, fixture: MarkdownFixture, chunk?: number) => Promise<BenchResult> }
}

const engines: MarkdownEngine[] = ["streamdown", "words", "words-plain"];
const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function Pane({ engine, text, streaming, onRender, paneRef }: { engine: MarkdownEngine; text: string; streaming: boolean; onRender?: (ms: number) => void; paneRef?: React.Ref<HTMLDivElement> }) {
	const t = useTranslations("Common.ui.markdownLab");
	return (
		<section className="min-w-0 rounded-md border p-4" data-engine={engine}>
			<h2 className="mb-3 text-xs font-medium text-muted-foreground">{engine === "words" ? t("paneWords") : engine === "words-plain" ? t("wordsPlain") : t("paneStreamdown")}</h2>
			<div ref={paneRef} className="text-sm" data-md-output={engine}>
				<Profiler id={engine} onRender={(_id, _phase, actual) => onRender?.(actual)}>
					{engine === "words-plain" ? <WordsMarkdown isStreaming={streaming}>{text}</WordsMarkdown> : <ChatAnswerMarkdown engine={engine} content={text} isStreaming={streaming} />}
				</Profiler>
			</div>
		</section>
	);
}

export function MarkdownLab() {
	const t = useTranslations("Common.ui.markdownLab");
	const [fixture, setFixture] = useState<MarkdownFixture>("codeReview");
	const [chunk, setChunk] = useState(256);
	const [layout, setLayout] = useState<"both" | MarkdownEngine>("both");
	const [bench, setBench] = useState<{ engine: MarkdownEngine; text: string; streaming: boolean }>();
	const [results, setResults] = useState<BenchResult[]>([]);
	const reactMs = useRef(0);
	const benchRef = useRef<HTMLDivElement>(null);

	const run = useCallback(async (engine: MarkdownEngine, which: MarkdownFixture, size = 256): Promise<BenchResult> => {
		const source = markdownFixtures[which];
		window.__mdXss = 0;
		flushSync(() => setBench(undefined));
		await nextFrame();
		const longTasks: number[] = [];
		const observer = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")
			? new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(entry.duration); })
			: undefined;
		observer?.observe({ type: "longtask", buffered: false });
		(window as Window & { gc?: () => void }).gc?.();
		const heapBefore = heap();
		reactMs.current = 0;
		let updateMs = 0, maxUpdateMs = 0, updates = 0;
		for (let end = Math.min(size, source.length); ; end = Math.min(end + size, source.length)) {
			const done = end >= source.length;
			const started = performance.now();
			flushSync(() => setBench({ engine, text: source.slice(0, end), streaming: !done }));
			const spent = performance.now() - started;
			updateMs += spent; maxUpdateMs = Math.max(maxUpdateMs, spent); updates++;
			// Let the browser paint between chunks, as a real stream does.
			await nextFrame();
			if (done) break;
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
		observer?.disconnect();
		(window as Window & { gc?: () => void }).gc?.();
		const heapAfter = heap();
		const preStart = performance.now();
		for (let end = Math.min(size, source.length); ; end = Math.min(end + size, source.length)) { chipMarkdown(normalizeChatMarkdown(source.slice(0, end))); if (end >= source.length) break; }
		const preprocessMs = Math.round((performance.now() - preStart) * 10) / 10;
		const result: BenchResult = {
			engine, preprocessMs, fixture: which, chars: source.length, chunk: size, updates,
			updateMs: Math.round(updateMs * 10) / 10,
			reactMs: Math.round(reactMs.current * 10) / 10,
			maxUpdateMs: Math.round(maxUpdateMs * 10) / 10,
			longTasks: longTasks.length,
			longTaskMs: Math.round(longTasks.reduce((sum, value) => sum + value, 0)),
			heapDeltaMb: heapBefore !== undefined && heapAfter !== undefined ? Math.round((heapAfter - heapBefore) / 10485.76) / 100 : undefined,
			finalHtmlKb: Math.round((benchRef.current?.innerHTML.length ?? 0) / 102.4) / 10,
			xss: window.__mdXss ?? 0,
		};
		window.__mdBench = [...(window.__mdBench ?? []), result];
		setResults((previous) => [...previous, result]);
		return result;
	}, []);

	useEffect(() => { window.__mdRun = run; return () => { delete window.__mdRun; }; }, [run]);

	const text = markdownFixtures[fixture];
	return (
		<main className="mx-auto max-w-7xl space-y-6 p-6">
			<header className="space-y-2">
				<h1 className="text-xl font-semibold">{t("title")}</h1>
				<p className="text-sm text-muted-foreground">{t("description")} <code>?md=words</code>, <code>?md=streamdown</code></p>
				<div className="flex flex-wrap items-center gap-3 text-sm">
					<label className="flex items-center gap-2">{t("fixture")}
						<select className="rounded-md border bg-background px-2 py-1" value={fixture} onChange={(event) => setFixture(event.target.value as MarkdownFixture)}>
							{Object.keys(markdownFixtures).map((name) => <option key={name} value={name}>{name}</option>)}
						</select>
					</label>
					<label className="flex items-center gap-2">{t("show")}
						<select className="rounded-md border bg-background px-2 py-1" value={layout} onChange={(event) => setLayout(event.target.value as typeof layout)}>
							<option value="both">{t("both")}</option><option value="streamdown">{t("streamdown")}</option><option value="words">{t("words")}</option><option value="words-plain">{t("wordsPlain")}</option>
						</select>
					</label>
					<label className="flex items-center gap-2">{t("chunk")}
						<input className="w-20 rounded-md border bg-background px-2 py-1" type="number" min={1} value={chunk} onChange={(event) => setChunk(Number(event.target.value) || 256)} />
					</label>
					{engines.map((engine) => <button key={engine} type="button" className="rounded-md border px-3 py-1" onClick={() => void run(engine, fixture, chunk)}>{t("streamWith", { engine })}</button>)}
				</div>
			</header>

			{bench && (
				<div ref={benchRef} data-md-bench={bench.engine}>
					<Pane engine={bench.engine} text={bench.text} streaming={bench.streaming} onRender={(ms) => { reactMs.current += ms; }} />
				</div>
			)}

			{results.length > 0 && (
				<table className="w-full text-xs" data-md-results>
					<thead><tr>{["engine", "fixture", "chars", "chunk", "updates", "updateMs", "reactMs", "maxUpdateMs", "longTasks", "longTaskMs", "heapΔ MB", "html KB", "xss"].map((name) => <th key={name} className="border px-2 py-1 text-start">{name}</th>)}</tr></thead>
					<tbody>{results.map((result, index) => <tr key={index}>{[result.engine, result.fixture, result.chars, result.chunk, result.updates, result.updateMs, result.reactMs, result.maxUpdateMs, result.longTasks, result.longTaskMs, result.heapDeltaMb ?? "n/a", result.finalHtmlKb, result.xss].map((value, cell) => <td key={cell} className="border px-2 py-1">{value}</td>)}</tr>)}</tbody>
				</table>
			)}

			{!bench && (
				<div className={layout === "both" ? "grid gap-4 md:grid-cols-3" : ""}>
					{engines.filter((engine) => layout === "both" || layout === engine).map((engine) => <Pane key={engine} engine={engine} text={text} streaming={false} />)}
				</div>
			)}
		</main>
	);
}
