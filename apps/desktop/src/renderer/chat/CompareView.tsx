import { useState } from "react";
import { Columns3, Maximize2 } from "lucide-react";
import { useWorkspace, type CompareGroup } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { usePersistedState } from "../lib/persistedState";
import { ModelLogo } from "../components/ModelLogo";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { StatusDot } from "../shell/Sidebar";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { harnessNames, knownModel, modelLabel } from "./ModelPicker";
import { Requests } from "./Requests";

function CompareColumn({ id }: { id: string }) {
	const { api, overview, select } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === id);
	const { task } = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const [preview, setPreview] = useState<string>();
	const model = snapshot ? knownModel(snapshot.model) : undefined;
	return <section className="flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
		<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
			{snapshot && <span className="flex size-5 items-center justify-center [&_img]:size-4.5 [&_.harness-logo]:size-4.5"><ModelLogo model={model ?? { id: snapshot.model, name: snapshot.model }} harness={snapshot.harness} /></span>}
			<span className="min-w-0 truncate text-[13px] font-semibold">{snapshot ? model?.name ?? (snapshot.model === "default" ? harnessNames[snapshot.harness] : modelLabel(snapshot.model)) : "Unavailable chat"}</span>
			{snapshot && <StatusDot task={snapshot} />}
			<button type="button" aria-label="Open as a single chat" title="Open as a single chat" onClick={() => select(id)} className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Maximize2 className="size-3.5" /></button>
		</header>
		{task ? <Conversation task={task} compact onAttachment={setPreview} onBranch={() => select(id)}><Requests task={task} /></Conversation> : <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
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
	async function send() {
		if (!text.trim() || busy) return;
		setBusy(true);
		try {
			const results = await Promise.all(ids.map(id => command({ type: "send", id, text: text.trim() })));
			if (results.every(Boolean)) setText("");
		} finally { setBusy(false); }
	}
	return <div className="flex h-full min-w-0 flex-col">
		<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
			<Columns3 className="size-4 text-muted-foreground" />
			<span className="min-w-0 truncate text-sm font-semibold">{group.title}</span>
			<span className="text-xs text-muted-foreground">· {ids.length} models</span>
		</header>
		<div className="flex min-h-0 flex-1">{ids.map(id => <CompareColumn key={id} id={id} />)}</div>
		<div className="mx-auto w-full max-w-[760px] px-6 pt-3 pb-4">
			<Composer value={text} onChange={setText} onSubmit={() => void send()} canSend={!busy && !!text.trim()} running={running}
				onStop={() => { for (const id of ids) void command({ type: "cancel", id }); }}
				placeholder={running ? "Queue a follow-up for every model…" : "Ask every model a follow-up…"} />
		</div>
	</div>;
}
