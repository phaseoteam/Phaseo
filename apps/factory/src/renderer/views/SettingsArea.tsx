import { ArrowLeft, BookText, Bot, CircleDot, FolderGit2, GitFork, GitPullRequest, Keyboard, ListChecks, NotebookPen, Search, SlidersHorizontal, Workflow } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { FactorySnapshot, WorkKind } from "../../shared/types";
import { href, type Route } from "../lib/useFactory";
import { SettingsBack } from "../components/Settings";
import { cn } from "../lib/utils";
import { AgentsSettings, GitHubSettings, RepositoriesSettings } from "./AgentsView";
import { PlaybookSettings, type PlaybookSection } from "./PlaybooksView";
import { NotesSettings } from "./NotesSettings";
import { GeneralSettings, ShortcutSettings } from "./SettingsView";

/** Every settings page, by the tab in its route: #/settings?tab=issue-agents. */
export type SettingsTab = "general" | "shortcuts" | "agents" | "github" | "repositories" | "notes" | `${WorkKind}-${PlaybookSection}`;

interface Entry {
	id: SettingsTab;
	label: string;
	icon: ReactNode;
	keywords: string;
}

const playbook = (kind: WorkKind, noun: string): Entry[] => [
	{ id: `${kind}-handoff`, label: kind === "issue" ? "Proof and hand-off" : "Review and findings", icon: <ListChecks />, keywords: `${noun} proof require pull request open post github reporter missing details ask comment findings independent review merge` },
	{ id: `${kind}-agents`, label: "Agents and rules", icon: <Workflow />, keywords: `${noun} default agent models by stage pin rules priority author size` },
	{ id: `${kind}-prompts`, label: "Prompts", icon: <BookText />, keywords: `${noun} instructions stages briefs preview prompt` },
];

const GROUPS: { label: string; icon?: ReactNode; pages: Entry[] }[] = [
	{ label: "App", pages: [
		{ id: "general", label: "General", icon: <SlidersHorizontal />, keywords: "theme dark light system appearance" },
		{ id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard />, keywords: "keys hotkeys ctrl k n search" },
	] },
	{ label: "Connections", pages: [
		{ id: "agents", label: "Agents", icon: <Bot />, keywords: "claude code codex subscription hub proxy phaseo api key slots" },
		{ id: "github", label: "GitHub", icon: <GitFork />, keywords: "gh cli images attach check new work poll schedule api requests" },
		{ id: "repositories", label: "Repositories", icon: <FolderGit2 />, keywords: "repos clone checkout folder add remove import" },
		{ id: "notes", label: "Notes", icon: <NotebookPen />, keywords: "notes memory remember learnt agents repository tests setup" },
	] },
	{ label: "Issues", icon: <CircleDot />, pages: playbook("issue", "issues") },
	{ label: "Pull requests", icon: <GitPullRequest />, pages: playbook("pull", "pull requests") },
];

export const SETTINGS_PAGES = GROUPS.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.label })));

const isTab = (tab: string | undefined): tab is SettingsTab => SETTINGS_PAGES.some((page) => page.id === tab);

/** Where settings open when no page is named. */
export function settingsTab(route: Route): SettingsTab {
	// Factory no longer picks work up on its own; the old page's agent lives under Agents and rules.
	if (route.tab?.endsWith("-pickup")) return route.tab.startsWith("pull") ? "pull-agents" : "issue-agents";
	return isTab(route.tab) ? route.tab : "general";
}

/** Replaces the work list while settings are open: back to work, a search box and the pages, grouped. */
function SettingsNav({ current, fill }: { current?: SettingsTab; fill?: boolean }) {
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const shown = GROUPS
		.map((group) => ({ ...group, pages: group.pages.filter((page) => !needle || `${group.label} ${page.label} ${page.keywords}`.toLowerCase().includes(needle)) }))
		.filter((group) => group.pages.length);
	const go = (tab: SettingsTab) => (window.location.hash = href({ page: "settings", tab }));

	return <aside className={cn("flex flex-col bg-sidebar", fill ? "min-w-0 flex-1" : "w-[260px] shrink-0 border-r")}>
		<nav aria-label="Settings sections" className="flex flex-col gap-0.5 overflow-y-auto p-2.5">
			<a href={href({ page: "work" })} className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"><ArrowLeft className="size-4" />Back to work</a>
			<p className="px-2 pt-1 pb-2 text-[15px] font-bold">Settings</p>
			<label className="mb-2 flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-muted-foreground focus-within:border-ring">
				<Search className="size-3.5 shrink-0" />
				<input aria-label="Search settings" placeholder="Search settings" value={query} onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && shown[0]) go(shown[0].pages[0].id);
						if (event.key === "Escape" && query) {
							event.stopPropagation();
							setQuery("");
						}
					}}
					className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
			</label>
			{shown.map((group) => <div key={group.label} className="flex flex-col gap-0.5 pb-2">
				<p className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground [&_svg]:size-3.5">{group.icon}{group.label}</p>
				{group.pages.map((page) => <a key={page.id} href={href({ page: "settings", tab: page.id })} aria-current={current === page.id ? "page" : undefined}
					className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground/80 hover:bg-accent/60 [&_svg]:size-4 [&_svg]:text-muted-foreground", current === page.id && "bg-accent font-medium text-foreground")}>{page.icon}{page.label}</a>)}
			</div>)}
			{!shown.length && <p className="px-2.5 py-2 text-xs text-muted-foreground">No settings match.</p>}
		</nav>
	</aside>;
}

/** `narrow`: the pages list fills the window until a page is picked; then the page does, with a way back. */
export function SettingsArea({ snapshot, route, narrow }: { snapshot: FactorySnapshot; route: Route; narrow?: boolean }) {
	const tab = settingsTab(route);
	// Escape goes back to work, unless a menu or the search is open and takes it first.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (document.querySelector("[data-slot=dropdown-menu-content], [data-slot=popover-content], [role=dialog]")) return;
			window.location.hash = href({ page: "work" });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const [kind, section] = tab.split("-") as [WorkKind, PlaybookSection];
	if (narrow && !route.tab) return <SettingsNav fill />;
	return <SettingsBack.Provider value={narrow ? href({ page: "settings" }) : null}>
		{!narrow && <SettingsNav current={tab} />}
		{tab === "general" && <GeneralSettings snapshot={snapshot} />}
		{tab === "shortcuts" && <ShortcutSettings />}
		{tab === "agents" && <AgentsSettings snapshot={snapshot} />}
		{tab === "github" && <GitHubSettings snapshot={snapshot} />}
		{tab === "repositories" && <RepositoriesSettings snapshot={snapshot} />}
		{tab === "notes" && <NotesSettings snapshot={snapshot} />}
		{(kind === "issue" || kind === "pull") && section && <PlaybookSettings key={tab} snapshot={snapshot} kind={kind} section={section} />}
	</SettingsBack.Provider>;
}
