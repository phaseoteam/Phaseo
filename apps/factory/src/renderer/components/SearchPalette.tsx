import { Inbox, Plus, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stageLabel } from "../../shared/stages";
import type { FactorySnapshot } from "../../shared/types";
import { since } from "../lib/format";
import { href } from "../lib/useFactory";
import { cn } from "../lib/utils";
import { AgentMark, ItemMark, StatusMark } from "./Marks";
import { SETTINGS_PAGES } from "../views/SettingsArea";
import { repoName } from "./RepoPicker";

interface Result {
	key: string;
	group: string;
	mark: ReactNode;
	title: string;
	meta?: string;
	to: string;
}

const PAGES = [
	{ title: "Work", to: href({ page: "work" }), icon: Inbox },
	{ title: "New issue", to: href({ page: "new" }), icon: Plus },

	{ title: "Settings", to: href({ page: "settings" }), icon: Settings },
];

/** How many of each kind show; the rest are a few more letters away. */
const PER_GROUP = 8;

/** Every word typed has to appear somewhere in the text, in any order. */
function matches(text: string, words: string[]) {
	const haystack = text.toLowerCase();
	return words.every((word) => haystack.includes(word));
}

function results(snapshot: FactorySnapshot, query: string): Result[] {
	const words = query.toLowerCase().replace(/^#/, "").split(/\s+/).filter(Boolean);
	const showRepo = snapshot.settings.repos.length > 1;
	const items = snapshot.items
		.filter((item) => !words.length || matches(`${item.title} ${item.number} #${item.number} ${item.repo} ${item.labels.join(" ")} ${item.author.login}`, words))
		.sort((a, b) => (words.length === 1 && String(b.number) === words[0] ? 1 : 0) - (words.length === 1 && String(a.number) === words[0] ? 1 : 0) || b.updatedAt - a.updatedAt)
		.slice(0, PER_GROUP)
		.map((item): Result => ({ key: item.id, group: "Work", mark: <ItemMark item={item} />, title: item.title, meta: `${showRepo ? `${repoName(item.repo)} ` : ""}#${item.number}`, to: href({ page: "work", item: item.id }) }));
	const runs = words.length ? snapshot.runs
		.map((run) => ({ run, item: snapshot.items.find((item) => item.id === run.itemId), agent: snapshot.agents.find((agent) => agent.id === run.agentId) }))
		.filter(({ run, item, agent }) => item && matches(`${stageLabel(run.stage)} ${run.status} ${run.summary ?? ""} ${item.title} ${item.number} ${agent?.label ?? ""} run`, words))
		.sort((a, b) => b.run.startedAt - a.run.startedAt)
		.slice(0, PER_GROUP)
		.map(({ run, item, agent }): Result => ({
			key: run.id,
			group: "Runs",
			mark: <StatusMark status={run.status === "running" ? "running" : run.status === "succeeded" ? "done" : run.status === "cancelled" ? "skipped" : "failed"} className="size-4" />,
			title: `${stageLabel(run.stage)} on #${item!.number} ${item!.title}`,
			meta: `${agent?.label ?? run.agentId} · ${since(run.startedAt)}`,
			to: href({ page: "work", item: item!.id, tab: "runs" }),
		})) : [];
	const agents = snapshot.agents
		.filter((agent) => words.length && matches(`${agent.label} ${agent.model} ${agent.harness} agent`, words))
		.slice(0, PER_GROUP)
		.map((agent): Result => ({ key: agent.id, group: "Agents", mark: <AgentMark agent={agent} className="size-4" />, title: agent.label, meta: agent.model, to: href({ page: "settings", tab: "agents" }) }));
	const pages = PAGES
		.filter((page) => !words.length || matches(page.title, words))
		.map((page): Result => ({ key: page.to, group: "Go to", mark: <page.icon className="size-4 text-muted-foreground" />, title: page.title, to: page.to }));
	// Settings pages show once something's typed, found by their name, their group or what's on them.
	const settings = words.length ? SETTINGS_PAGES
		.filter((page) => matches(`${page.group} ${page.label} ${page.keywords} settings`, words))
		.map((page): Result => ({ key: `settings-${page.id}`, group: "Settings", mark: <span className="text-muted-foreground [&_svg]:size-4">{page.icon}</span>, title: page.label, meta: page.group, to: href({ page: "settings", tab: page.id }) })) : [];
	return [...items, ...runs, ...agents, ...pages, ...settings];
}

/** Ctrl K: finds work, runs, agents and pages, then goes there. */
export function SearchPalette({ snapshot, open, onClose }: { snapshot: FactorySnapshot; open: boolean; onClose: () => void }) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	const found = useMemo(() => (open ? results(snapshot, query) : []), [open, snapshot, query]);

	useEffect(() => {
		if (!open) return;
		setQuery("");
		setActive(0);
	}, [open]);
	useEffect(() => setActive(0), [query]);
	useEffect(() => {
		list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	if (!open) return null;
	const go = (result: Result | undefined) => {
		if (!result) return;
		window.location.hash = result.to;
		onClose();
	};
	const onKey = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((index) => (index + step + found.length) % Math.max(found.length, 1));
		} else if (event.key === "Enter") {
			event.preventDefault();
			go(found[active]);
		} else if (event.key === "Escape") {
			event.preventDefault();
			onClose();
		}
	};

	return <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
		<div role="dialog" aria-label="Search" className="w-[600px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-2xl">
			<div className="flex items-center gap-2 border-b px-3">
				<Search className="size-4 text-muted-foreground" />
				<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} placeholder="Search work, runs and agents" aria-label="Search" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
			</div>
			<div ref={list} className="max-h-[60vh] overflow-y-auto p-1.5">
				{found.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches that.</p>}
				{found.map((result, index) => <div key={result.key}>
					{result.group !== found[index - 1]?.group && <div className="px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground">{result.group}</div>}
					<button type="button" data-index={index} onMouseMove={() => setActive(index)} onClick={() => go(result)} className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left", index === active && "bg-accent")}>
						<span className="grid size-4 shrink-0 place-items-center">{result.mark}</span>
						<span className="min-w-0 flex-1 truncate text-sm">{result.title}</span>
						{result.meta && <span className="shrink-0 truncate text-2xs text-muted-foreground tabular-nums">{result.meta}</span>}
					</button>
				</div>)}
			</div>
		</div>
	</div>;
}
