import { FolderGit2, GripVertical } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Connection, FactorySettings, FactorySnapshot, RepoStatus } from "../../shared/types";
import { AddRepo, errorText, useLocalClones } from "../components/AddRepo";
import { effortLabel } from "../components/AgentPicker";
import { AgentMark, PersonMark } from "../components/Marks";
import { Choice, Field, Group, Row, SettingsPage } from "../components/Settings";
import { Button } from "../components/ui/button";
import { since } from "../lib/format";
import { factory, useNow } from "../lib/useFactory";
import { cn } from "../lib/utils";

/** How much of each subscription window is used, for example " 5-hour window 62% used, Weekly 31% used." */
function usage(connection: Connection): string {
	if (!connection.windows?.length) return "";
	return ` ${connection.windows.map((window) => `${window.label} ${Math.round(window.used * 100)}% used`).join(", ")}.`;
}

function StatusText({ connection }: { connection: Connection }) {
	const tone = connection.status === "ready" ? "text-success" : connection.status === "error" ? "text-destructive" : "text-muted-foreground";
	const label = connection.status === "ready" ? "Connected" : connection.status === "missing" ? "Not found" : connection.status === "error" ? "Error" : "Off";
	return <span className={cn("flex items-center gap-1.5 text-xs font-medium", tone)}>
		<span className={cn("size-1.5 rounded-[2px]", connection.status === "ready" ? "bg-success" : connection.status === "error" ? "bg-destructive" : "bg-muted-foreground/50")} />
		{label}
	</span>;
}

/** Each check is one search per repository for what changed. */
function checksPerHour(minutes: number, repos: number) {
	return Math.round((60 / minutes) * Math.max(1, repos));
}

function CheckNow({ snapshot }: { snapshot: FactorySnapshot }) {
	const now = useNow(15_000);
	const [busy, setBusy] = useState(false);
	return <Button variant="outline" size="sm" disabled={busy} onClick={() => {
		setBusy(true);
		void factory().refresh().finally(() => setBusy(false));
	}}>{busy ? "Checking…" : snapshot.loadedAt ? `Checked ${since(snapshot.loadedAt, now)}` : "Check now"}</Button>;
}

/** One repository: what's been read from it, its local clone, and buttons to read it again or remove it. */
function RepoRow({ repo, checkout, status, handle }: { repo: string; checkout: string; status: RepoStatus | undefined; handle?: ReactNode }) {
	const now = useNow(15_000);
	const [error, setError] = useState<string | null>(null);
	const setClone = (path: string) => {
		setError(null);
		void factory().addRepo(repo, path).catch((cause: unknown) => setError(errorText(cause)));
	};
	const found = useLocalClones()?.find((clone) => clone.repo.toLowerCase() === repo.toLowerCase());
	const counts = status ? `${status.issues.toLocaleString("en-US")} open ${status.issues === 1 ? "issue" : "issues"} and ${status.pulls.toLocaleString("en-US")} ${status.pulls === 1 ? "pull request" : "pull requests"}` : "";
	const description = status?.importing
		? `Importing${status.importing.total ? ` ${status.importing.done.toLocaleString("en-US")} of ${status.importing.total.toLocaleString("en-US")}` : ""}…`
		: status?.error
			? status.error
			: status?.importedAt
				? `${counts}. Read in full ${since(status.importedAt, now)}${status.syncedAt ? `, changes checked ${since(status.syncedAt, now)}` : ""}.`
				: "Not read yet.";
	return <div className="px-4 py-3.5">
		<div className="flex items-center gap-4">
			{handle ?? <FolderGit2 className="size-5 shrink-0 text-muted-foreground" />}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{repo}</div>
				<div className={cn("mt-0.5 text-xs", status?.error && !status.importing ? "text-destructive" : "text-muted-foreground")}>{description}</div>
			</div>
			<Button variant="outline" size="sm" disabled={!!status?.importing} onClick={() => void factory().importRepo(repo)}>Import again</Button>
			<Button variant="ghost" size="sm" onClick={() => void factory().removeRepo(repo)}>Remove</Button>
		</div>
		<div className="mt-2.5 flex items-center gap-2 pl-9">
			<span className="w-20 shrink-0 text-xs text-muted-foreground">Local clone</span>
			<Field value={checkout} placeholder="Needed before agents can work on it" mono className="w-auto flex-1" onSave={setClone} />
		</div>
		{error && <p className="mt-1.5 pl-[124px] text-xs text-destructive">{error}</p>}
		{!checkout && found && <div className="mt-1.5 flex items-center gap-2 pl-[124px] text-2xs text-muted-foreground">
			<span className="min-w-0 truncate">Found a clone at <span className="font-mono">{found.path}</span></span>
			<Button variant="outline" size="sm" className="h-6 px-2 text-2xs" onClick={() => setClone(found.path)}>Use it</Button>
		</div>}
	</div>;
}

/**
 * The repositories in the picker's order. A row is dragged by its handle, so the clone field inside it
 * still selects text; the handle also moves with the arrow keys.
 */
function OrderedRepos({ snapshot }: { snapshot: FactorySnapshot }) {
	const saved = snapshot.settings.repos.map((entry) => entry.repo);
	// While a row is dragged the list shows where it would land; the order is saved when it's let go.
	const [drag, setDrag] = useState<{ repo: string; order: string[]; startY: number; y: number } | null>(null);
	const rows = useRef(new Map<string, HTMLDivElement>());
	const order = drag && drag.order.length === saved.length && drag.order.every((repo) => saved.includes(repo)) ? drag.order : saved;
	const movable = saved.length > 1;
	const moveTo = (list: string[], repo: string, index: number) => {
		const rest = list.filter((entry) => entry !== repo);
		return [...rest.slice(0, index), repo, ...rest.slice(index)];
	};
	const save = (next: string[]) => {
		if (next.join("\n") !== saved.join("\n")) void factory().orderRepos(next);
	};
	const onKey = (repo: string) => (event: KeyboardEvent) => {
		const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
		const index = order.indexOf(repo) + step;
		if (!step || index < 0 || index >= order.length) return;
		event.preventDefault();
		save(moveTo(order, repo, index));
	};
	const onPointerDown = (repo: string) => (event: PointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDrag({ repo, order: saved, startY: event.clientY, y: event.clientY });
	};
	const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
		if (!drag) return;
		// The dragged row lands where the pointer passes the middle of the other rows.
		const others = drag.order.filter((repo) => repo !== drag.repo);
		const index = others.filter((repo) => {
			const box = rows.current.get(repo)?.getBoundingClientRect();
			return box ? event.clientY > box.top + box.height / 2 : false;
		}).length;
		const next = moveTo(drag.order, drag.repo, index);
		setDrag({ ...drag, y: event.clientY, order: next.join("\n") === drag.order.join("\n") ? drag.order : next });
	};
	const onPointerUp = () => {
		if (drag) save(drag.order);
		setDrag(null);
	};
	return <>
		{order.map((repo) => {
			const entry = snapshot.settings.repos.find((candidate) => candidate.repo === repo)!;
			const status = snapshot.repos.find((candidate) => candidate.repo === repo);
			const dragging = drag?.repo === repo;
			const handle = movable ? <button
				type="button"
				aria-label={`Move ${repo}. Use the up and down arrow keys.`}
				title="Drag to reorder"
				onPointerDown={onPointerDown(repo)}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={() => setDrag(null)}
				onKeyDown={onKey(repo)}
				className={cn("-ml-1 grid size-6 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground", dragging ? "cursor-grabbing" : "cursor-grab")}
			><GripVertical className="size-4" /></button> : undefined;
			return <div
				key={repo}
				ref={(node) => {
					if (node) rows.current.set(repo, node);
					else rows.current.delete(repo);
				}}
				className={cn(dragging && "relative z-10 bg-accent/50", drag && "select-none")}
			>
				<RepoRow repo={repo} checkout={entry.path} status={status} handle={handle} />
			</div>;
		})}
	</>;
}

/** Where agents run: the subscriptions on this computer, a hub that pools accounts, or Phaseo credits. */
export function AgentsSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	const update = (patch: Partial<FactorySettings>) => void factory().updateSettings(patch);
	const byKind = (kind: Connection["kind"]) => snapshot.connections.find((connection) => connection.kind === kind);
	const agentsOn = (connection: Connection | undefined) => snapshot.agents.filter((agent) => agent.connectionId === connection?.id);
	const setEffort = (agentId: string, effort: string) => {
		const agentEfforts = { ...snapshot.settings.agentEfforts };
		if (effort) agentEfforts[agentId] = effort;
		else delete agentEfforts[agentId];
		update({ agentEfforts });
	};
	/** A connection's models, each with how hard it thinks. Nothing until the connection is ready. */
	const models = (connection: Connection | undefined, description: string) => {
		const agents = agentsOn(connection);
		if (!connection || connection.status !== "ready" || !agents.length) return null;
		return <Group key={`${connection.id}-models`} title={`${connection.label} models`} description={description}>
			{agents.map((agent) => <Row key={agent.id} mark={connection.kind === "hub" ? <AgentMark agent={agent} className="size-5" /> : undefined} title={<span className="flex items-center gap-2">{agent.label}{agent.isDefault && <span className="rounded-[4px] border px-1.5 text-2xs font-normal text-muted-foreground">Default</span>}</span>} description={agent.description ?? (agent.model ? `--model ${agent.model}` : "")}>
				{agent.efforts?.length
					? <Choice<string> value={snapshot.settings.agentEfforts[agent.id] ?? ""} options={[{ value: "", label: agent.defaultEffort ? `Default (${effortLabel(agent.defaultEffort)})` : "Default" }, ...agent.efforts.map((effort) => ({ value: effort, label: effortLabel(effort) }))]} onChange={(effort) => setEffort(agent.id, effort)} />
					: <span className="text-xs text-muted-foreground">No effort levels</span>}
			</Row>)}
		</Group>;
	};

	return <SettingsPage title="Agents" description="Factory runs agents with the subscriptions already signed in on this computer. Nothing is billed by Phaseo unless you add an API key.">
		<Group title="Subscriptions on this computer" description="Detected from the command line tools on your PATH.">
			{(["claude-cli", "codex-cli"] as const).map((kind) => {
				const connection = byKind(kind);
				if (!connection) return null;
				return <Row key={kind} mark={<AgentMark agent={{ harness: kind === "claude-cli" ? "claude" : "codex" }} className="size-8" />} title={<span className="flex items-center gap-2">{connection.label}{connection.version && <span className="font-mono text-2xs font-normal text-muted-foreground">{connection.version}</span>}</span>} description={connection.status === "ready" ? `${connection.detail}. ${agentsOn(connection).length === 1 ? "1 model" : `${agentsOn(connection).length} models`}, up to ${connection.slots} runs at once.${usage(connection)}` : connection.detail}>
					<StatusText connection={connection} />
				</Row>;
			})}
		</Group>

		{(["claude-cli", "codex-cli"] as const).map((kind) => {
			const connection = byKind(kind);
			return models(connection, `What ${connection?.label} ${connection?.version ?? ""} on this computer offers, as it describes them. Choose how hard each one thinks; unset uses ${connection?.label}'s own default.`.replace("  ", " "));
		})}

		<Group title="Hubs" description="A local proxy that pools several accounts. Claude Code and Codex run as usual, pointed at the hub with its key.">
			{byKind("hub") && <>
				<Row title="CLI proxy hub" description={byKind("hub")!.detail}>
					<StatusText connection={byKind("hub")!} />
					<Field value={snapshot.settings.hubUrl} placeholder="http://127.0.0.1:8317" mono onSave={(hubUrl) => update({ hubUrl })} />
				</Row>
				<Row title="Key" description="One of the API keys in the hub's settings. Saved encrypted on this computer.">
					<Field value={snapshot.settings.hubKey} placeholder="Hub API key" mono secret onSave={(hubKey) => update({ hubKey })} />
				</Row>
			</>}
		</Group>

		{models(byKind("hub"), "Claude Code's and Codex's models that the hub serves, run through the hub. Choose how hard each one thinks; unset uses the tool's own default.")}

		<Group title="Phaseo API" description="Run hundreds of models on pay-as-you-go credits when a subscription is busy or out of its window.">
			<Row mark={<AgentMark agent={{ harness: "phaseo" }} className="size-8" />} title="Phaseo API key" description="Used as overflow, and for models no subscription covers.">
				<Button variant="outline" size="sm">Connect</Button>
			</Row>
		</Group>
	</SettingsPage>;
}

/** The GitHub CLI Factory reads and writes through, and how often it checks for new work. */
export function GitHubSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	const update = (patch: Partial<FactorySettings>) => void factory().updateSettings(patch);
	return <SettingsPage title="GitHub" description="Factory reads issues and pull requests, opens pull requests and posts proof through the GitHub CLI you're signed in to.">
		<Group title="GitHub CLI">
			<Row
				title={snapshot.github.login ? snapshot.github.login : "GitHub CLI"}
				mark={snapshot.github.login ? <PersonMark login={snapshot.github.login} avatar={snapshot.github.avatar} className="size-8 rounded-md" /> : undefined}
				description={snapshot.github.version ? `${snapshot.github.login ? "Signed in to the GitHub CLI" : "GitHub CLI"} ${snapshot.github.version} on this computer. Comments, reviews and merges from Factory are made as this account.` : "gh wasn't found. Install it from cli.github.com, then sign in with gh auth login."}
			>
				<span className={snapshot.github.version ? "text-sm text-success" : "text-sm text-destructive"}>{snapshot.github.version ? "Found" : "Not found"}</span>
			</Row>
			<Row title="Images on GitHub" description={snapshot.github.attach
				? `GitHub CLI ${snapshot.github.version} puts screenshots and recordings on issues, pull requests and comments, the same way pasting them on github.com does.`
				: `New issues' images and agents' screenshots show on GitHub with GitHub CLI 2.99 or later. ${snapshot.github.version ? `You have ${snapshot.github.version}` : "gh wasn't found"}, so they stay in Factory for now. Update with winget upgrade GitHub.cli.`}>
				<span className={snapshot.github.attach ? "text-sm text-success" : "text-sm text-warning"}>{snapshot.github.attach ? "On" : "Needs gh 2.99"}</span>
			</Row>
		</Group>
		<Group title="Checking for new work">
			<Row title="Check for new work" description={`Factory checks for new and changed issues and pull requests on this schedule and whenever you come back to the window. Each check only asks for what changed: about ${checksPerHour(snapshot.settings.pollMinutes, snapshot.settings.repos.length)} of your 5,000 GitHub API requests an hour.`}>
				<CheckNow snapshot={snapshot} />
				<Choice value={snapshot.settings.pollMinutes} options={[1, 2, 5, 15, 30].map((minutes) => ({ value: minutes, label: minutes === 1 ? "Every minute" : `Every ${minutes} minutes` }))} onChange={(pollMinutes) => update({ pollMinutes })} />
			</Row>
		</Group>
	</SettingsPage>;
}

/** The repositories Factory works on, each with the clone its agents work from. */
export function RepositoriesSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	return <SettingsPage title="Repositories" description="Factory reads every open issue and pull request with the GitHub CLI, then only what changed. Runs work in their own git worktree made from your clone, never in the clone itself.">
		<Group title={snapshot.settings.repos.length === 1 ? "1 repository" : `${snapshot.settings.repos.length} repositories`} description={snapshot.settings.repos.length > 1 ? "Drag a repository by its handle to change the order the repository picker lists them in." : undefined}>
			<OrderedRepos snapshot={snapshot} />
			<div className="px-4 py-3.5">
				<div className="mb-2 text-sm font-medium">{snapshot.settings.repos.length ? "Add another" : "Add a repository"}</div>
				<AddRepo added={snapshot.settings.repos.map((entry) => entry.repo)} />
			</div>
		</Group>
	</SettingsPage>;
}
