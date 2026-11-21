// Development only (?markdown-lab): desktop messages drawn by react-markdown (current) and Words, side by side, plus a streaming benchmark.
import { Profiler, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ReactMarkdownMessageContent } from "../components/MessageContent";
import { WordsMessageContent } from "../components/WordsMessageContent";
import type { MarkdownEngine } from "../components/markdownEngine";
import { markdownFixtures, type MarkdownFixture } from "./markdownFixtures";

type BenchResult = { engine: MarkdownEngine; fixture: MarkdownFixture; chars: number; chunk: number; updates: number; updateMs: number; reactMs: number; maxUpdateMs: number; longTasks: number; longTaskMs: number; heapDeltaMb?: number; finalHtmlKb: number; xss: number };
declare global { interface Window { __mdBench?: BenchResult[]; __mdXss?: number; __mdRun?: (engine: MarkdownEngine, fixture: MarkdownFixture, chunk?: number) => Promise<BenchResult> } }

const engines: MarkdownEngine[] = ["react-markdown", "words"];
const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function Body({ engine, text, streaming }: { engine: MarkdownEngine; text: string; streaming: boolean }) {
	return engine === "words" ? <WordsMessageContent text={text} streaming={streaming} repairLocalLinks /> : <ReactMarkdownMessageContent text={text} repairLocalLinks />;
}

function Pane({ engine, text, streaming, onRender }: { engine: MarkdownEngine; text: string; streaming: boolean; onRender?: (ms: number) => void }) {
	return <section className="min-w-0 rounded-md border border-border p-4" data-engine={engine}>
		<h2 className="mb-3 text-xs font-medium text-muted-foreground">{engine === "words" ? "Words (@pierre/words)" : "react-markdown (current)"}</h2>
		<div data-selectable className="text-[14px] leading-relaxed" data-md-output={engine}>
			<Profiler id={engine} onRender={(_id, _phase, actual) => onRender?.(actual)}><Body engine={engine} text={text} streaming={streaming} /></Profiler>
		</div>
	</section>;
}

export function MarkdownLab() {
	const [fixture, setFixture] = useState<MarkdownFixture>("codeReview");
	const [chunk, setChunk] = useState(256);
	const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
	const [bench, setBench] = useState<{ engine: MarkdownEngine; text: string; streaming: boolean }>();
	const [results, setResults] = useState<BenchResult[]>([]);
	const reactMs = useRef(0);
	const benchRef = useRef<HTMLDivElement>(null);
	useEffect(() => { document.documentElement.classList.toggle("dark", dark); document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

	const run = useCallback(async (engine: MarkdownEngine, which: MarkdownFixture, size = 256): Promise<BenchResult> => {
		const source = markdownFixtures[which];
		window.__mdXss = 0;
		flushSync(() => setBench(undefined));
		await nextFrame();
		const longTasks: number[] = [];
		const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
		observer.observe({ type: "longtask", buffered: false });
		const before = heap();
		reactMs.current = 0;
		let updateMs = 0, maxUpdateMs = 0, updates = 0;
		for (let end = Math.min(size, source.length); ; end = Math.min(end + size, source.length)) {
			const done = end >= source.length, started = performance.now();
			flushSync(() => setBench({ engine, text: source.slice(0, end), streaming: !done }));
			const spent = performance.now() - started;
			updateMs += spent; maxUpdateMs = Math.max(maxUpdateMs, spent); updates++;
			await nextFrame();
			if (done) break;
		}
		await new Promise(resolve => setTimeout(resolve, 300));
		observer.disconnect();
		const after = heap();
		const result: BenchResult = {
			engine, fixture: which, chars: source.length, chunk: size, updates,
			updateMs: Math.round(updateMs * 10) / 10, reactMs: Math.round(reactMs.current * 10) / 10, maxUpdateMs: Math.round(maxUpdateMs * 10) / 10,
			longTasks: longTasks.length, longTaskMs: Math.round(longTasks.reduce((sum, value) => sum + value, 0)),
			heapDeltaMb: before !== undefined && after !== undefined ? Math.round((after - before) / 10485.76) / 100 : undefined,
			finalHtmlKb: Math.round((benchRef.current?.innerHTML.length ?? 0) / 102.4) / 10, xss: window.__mdXss ?? 0,
		};
		window.__mdBench = [...(window.__mdBench ?? []), result];
		setResults(previous => [...previous, result]);
		return result;
	}, []);
	useEffect(() => { window.__mdRun = run; return () => { delete window.__mdRun; }; }, [run]);

	return <main className="h-screen space-y-4 overflow-auto bg-background p-6 text-foreground">
		<header className="flex flex-wrap items-center gap-3 text-sm">
			<h1 className="text-base font-semibold">Markdown renderer lab (desktop)</h1>
			<select className="rounded-md border border-border bg-background px-2 py-1" value={fixture} onChange={event => setFixture(event.target.value as MarkdownFixture)}>{Object.keys(markdownFixtures).map(name => <option key={name}>{name}</option>)}</select>
			<input className="w-20 rounded-md border border-border bg-background px-2 py-1" type="number" value={chunk} onChange={event => setChunk(Number(event.target.value) || 256)} />
			<button type="button" className="rounded-md border border-border px-3 py-1" onClick={() => setDark(value => !value)}>{dark ? "Light" : "Dark"}</button>
			{engines.map(engine => <button key={engine} type="button" className="rounded-md border border-border px-3 py-1" onClick={() => void run(engine, fixture, chunk)}>Stream with {engine}</button>)}
		</header>
		{bench && <div ref={benchRef}><Pane engine={bench.engine} text={bench.text} streaming={bench.streaming} onRender={ms => { reactMs.current += ms; }} /></div>}
		{results.length > 0 && <table className="w-full text-xs" data-md-results><tbody>{results.map((result, index) => <tr key={index}>{Object.values(result).map((value, cell) => <td key={cell} className="border border-border px-2 py-1">{String(value)}</td>)}</tr>)}</tbody></table>}
		{!bench && <div className="grid grid-cols-2 gap-4">{engines.map(engine => <Pane key={engine} engine={engine} text={markdownFixtures[fixture]} streaming={false} />)}</div>}
	</main>;
}
