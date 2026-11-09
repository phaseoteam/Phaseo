import { useState } from "react";
import { Columns3, Maximize2 } from "lucide-react";
import { useWorkspace, type CompareGroup } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { usePersistedState } from "../lib/persistedState";
import { ModelLogo } from "../components/ModelLogo";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { StatusDot } from "../shell/Sidebar";
import { Composer } from "./Composer";
import { useComposerEditor } from "./composerEditor";
import { useComposerMenu } from "./ComposerMenu";
import { composeMessage } from "../lib/mentions";
import { Conversation } from "./Conversation";
import { harnessNames, knownModel, modelLabel } from "./ModelPicker";
import { ModelInfoCard } from "./ModelInfoCard";
import { Requests } from "./Requests";
import { steerBlocker } from "./QueuePanel";
import { useWorkspacePreferences } from "../lib/workspacePreferences";
import { useCommand } from "../lib/keybindings";
import { useSendKey } from "./sendKey";

function CompareColumn({ id }: { id: string }) {
	const { api, overview, select } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === id);
	const { task } = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const [preview, setPreview] = useState<string>();
	const model = snapshot ? knownModel(snapshot.model) : undefined;
	return <section className="flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
		<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
			{snapshot && <span className="flex size-5 items-center justify-center [&_img]:size-4.5 [&_.harness-logo]:size-4.5"><ModelLogo model={model ?? { id: snapshot.model, name: snapshot.model }} harness={snapshot.harness} /></span>}
			{snapshot ? <ModelInfoCard harness={snapshot.harness} model={snapshot.model} className="min-w-0 truncate text-[13px] font-semibold">{model?.name ?? (snapshot.model === "default" ? harnessNames[snapshot.harness] : modelLabel(snapshot.model))}</ModelInfoCard> : <span className="min-w-0 truncate text-[13px] font-semibold">Unavailable chat</span>}
			{snapshot && <StatusDot task={snapshot} />}
			<button type="button" aria-label="Open as a single chat" title="Open as a single chat" onClick={() => select(id)} className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Maximize2 className="size-3.5" /></button>
		</header>
		{task ? <Conversation task={task} compact onAttachment={setPreview} onBranch={() => select(id)}><Requests task={task} inlineQuestions /></Conversation> : <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
		{preview && task && <AttachmentPreview taskId={task.id} id={preview} onClose={() => setPreview(undefined)} />}
	</section>;
}

export function CompareView({ group }: { group: CompareGroup }) {
	const { command, overview } = useWorkspace();
	const [drafts, setDrafts] = usePersistedState<Record<string, string>>("phaseo.desktop.compareDrafts", {});
	const [busy, setBusy] = useState(false);
	const ids = group.taskIds.filter(id => overview.tasks.some(task => task.id === id));
	const text = drafts[group.id] ?? "";
	const setText = (value: string) => setDrafts(current => ({ ...current, [group.id]: value }));
	const running = ids.some(id => ["running", "waiting"].includes(overview.tasks.find(task => task.id === id)?.status ?? ""));
	const followUpSteers = useWorkspacePreferences().chat.followUp === "steer";
	const canSteer = ids.some(id => { const task = overview.tasks.find(value => value.id === id); return task && !steerBlocker(task); });
	const editor = useComposerEditor({ value: text, onChange: setText, placeholder: running ? (followUpSteers ? "Steer every model…" : "Queue a follow-up for every model…") : "Ask every model a follow-up…" });
	// Each column is its own agent, so the menu offers saved prompts and chats rather than one agent's commands.
	const menu = useComposerMenu({ editor });
	const message = composeMessage(text);
	/** Steering sends into each running turn whose agent can take it; the other chats queue it (or start on it, when idle). */
	async function send(steer = followUpSteers) {
		if (!message.text || busy) return;
		setBusy(true);
		try {
			const prepared = await menu.prepare(message.text);
			const steerable = (id: string) => { const task = overview.tasks.find(value => value.id === id); return steer && Boolean(task && ["running", "waiting"].includes(task.status) && !steerBlocker(task)); };
			const results = await Promise.all(ids.map(id => steerable(id) ? command({ type: "steer", id, text: prepared.text }) : command({ type: "send", id, text: prepared.text, ...(message.threadReferences.length ? { threadReferences: message.threadReferences } : {}), ...(message.githubReferences.length ? { githubReferences: message.githubReferences } : {}) })));
			if (results.every(Boolean)) setText("");
		} finally { setBusy(false); }
	}
	// Mod+Shift+Enter steers, and the other send key does the opposite of the default, as in a single chat.
	useCommand("composer.steer", () => { void send(true); });
	const sendKey = useSendKey();
	useCommand("composer.sendAlternate", () => { if (!running || sendKey !== "enter") return false; void send(!followUpSteers); });
	return <div className="flex h-full min-w-0 flex-col">
		<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
			<Columns3 className="size-4 text-muted-foreground" />
			<span className="min-w-0 truncate text-sm font-semibold">{group.title}</span>
			<span className="text-xs text-muted-foreground">· {ids.length} models</span>
		</header>
		<div className="flex min-h-0 flex-1">{ids.map(id => <CompareColumn key={id} id={id} />)}</div>
		<div className="mx-auto w-full max-w-[760px] px-6 pt-3 pb-4">
			<Composer editor={editor} menu={menu} onSubmit={() => void send()} canSend={!busy && !!message.text} running={running}
				submitAction={running ? followUpSteers && canSteer ? "steer" : "queue" : "send"}
				onAlternateSubmit={running && canSteer ? () => void send(!followUpSteers) : undefined}
				onStop={() => { for (const id of ids) void command({ type: "cancel", id }); }} />
		</div>
	</div>;
}
