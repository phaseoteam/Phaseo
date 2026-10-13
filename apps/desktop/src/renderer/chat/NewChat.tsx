import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { BookOpen, Check, ChevronDown, Code2, FolderOpen, FolderPlus, ImageIcon, Lightbulb, ListChecks, PenLine, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { errorText, usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import { useModelPreferences, type ModelSelection } from "../lib/modelPreferences";
import { useModels } from "../lib/useModels";
import { usePersistedState } from "../lib/persistedState";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { cn } from "../lib/utils";
import { ModelLogo } from "../components/ModelLogo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Composer, ComposerChip, ToolButton } from "./Composer";
import { MAX_COMPARE, ModelPicker, knownModel, modelLabel, sameSelection } from "./ModelPicker";
import { ModelSettings } from "./ModelSettings";
import { SignInCard } from "./SignInCard";
import { startChat } from "./startChat";

const suggestions = [
	{ icon: PenLine, label: "Write", prompt: "Help me write " },
	{ icon: Search, label: "Research a topic", prompt: "Research and summarise what's known about " },
	{ icon: BookOpen, label: "Explain", prompt: "Explain in simple terms how " },
	{ icon: Lightbulb, label: "Brainstorm", prompt: "Brainstorm ten ideas for " },
	{ icon: ListChecks, label: "Make a plan", prompt: "Make a step-by-step plan to " },
];

function greeting() {
	const hour = new Date().getHours();
	return hour < 5 ? "Working late?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function PermissionMenu({ value, onChange }: { value: Task["permissionMode"]; onChange: (value: NonNullable<Task["permissionMode"]>) => void }) {
	const full = value === "full-access";
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium hover:bg-muted [&_svg]:size-4", full ? "text-warning" : "text-muted-foreground hover:text-foreground")} />}>
			{full ? <ShieldAlert /> : <ShieldCheck />}{full ? "Full access" : "Ask first"}<ChevronDown className="size-3!" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" side="top" className="w-72">
			<DropdownMenuItem onClick={() => onChange("supervised")} className="items-start"><ShieldCheck className="mt-0.5" /><span><span className="block font-semibold">Ask first</span><span className="text-xs text-muted-foreground">Approve commands and file changes before they run.</span></span>{!full && <Check className="ml-auto" />}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => onChange("full-access")} className="items-start"><ShieldAlert className="mt-0.5 text-warning" /><span><span className="block font-semibold">Full access</span><span className="text-xs text-muted-foreground">The agent runs commands and edits files without asking.</span></span>{full && <Check className="ml-auto" />}</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

export function PlanToggle({ value, onChange }: { value: Task["mode"]; onChange: (value: Task["mode"]) => void }) {
	return <ToolButton label={value === "plan" ? "Plan mode: the agent proposes a plan before editing" : "Switch to plan mode"} active={value === "plan"} onClick={() => onChange(value === "plan" ? "code" : "plan")}><ListChecks />Plan</ToolButton>;
}

export function NewChat() {
	const { api, overview, command, setOverview, setError, mode, select, openCompare, saveCompareGroup, newChatProjectId, setNewChatProjectId, openSettings } = useWorkspace();
	const [draft, setDraft] = usePersistedState("phaseo.desktop.newChatDraft", "");
	const [images, setImages] = useState<File[]>([]);
	const [busy, setBusy] = useState(false);

	const [planMode, setPlanMode] = usePersistedState<Task["mode"]>("phaseo.desktop.draftMode", "code");
	const [permissionMode, setPermissionMode] = usePersistedState<NonNullable<Task["permissionMode"]>>("phaseo.desktop.draftPermissions", "supervised");
	const preferences = useModelPreferences();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const connected = useConnectedHarnesses();
	const { models: phaseoModels } = useModels("phaseo", phaseoAccount?.id, undefined, undefined, !!phaseoAccount);
	const remembered = preferences.defaultSelection ?? preferences.recentSelection;
	const [selections, setSelections] = useState<ModelSelection[]>(remembered ? [remembered] : []);
	const input = useRef<HTMLTextAreaElement>(null);
	const code = mode === "code";
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const project = projects.find(value => value.id === newChatProjectId);

	useEffect(() => { input.current?.focus(); }, [mode]);
	useEffect(() => {
		if (selections.length || !phaseoAccount || !phaseoModels.length) return;
		const model = phaseoModels.find(value => value.default) ?? phaseoModels.find(value => /claude-sonnet|gpt-6\b/i.test(value.id)) ?? phaseoModels[0];
		setSelections([{ harness: "phaseo", accountId: phaseoAccount.id, model: model.id }]);
	}, [selections.length, phaseoAccount, phaseoModels]);
	const compare = !code && selections.length > 1;
	useEffect(() => { if (code) setSelections(current => current.length > 1 ? current.slice(0, 1) : current); }, [code]);

	const recent = useMemo(() => {
		const seen: ModelSelection[] = [];
		for (const value of [preferences.defaultSelection, ...preferences.recent]) if (value && !seen.some(item => sameSelection(item, value))) seen.push(value);
		return seen.slice(0, 3);
	}, [preferences]);

	const needsSignIn = !phaseoAccount && ![...connected].some(harness => harness !== "phaseo");
	const canSend = !busy && (!!draft.trim() || images.length > 0) && selections.length > 0 && (!code || !!project);

	async function submit() {
		if (!api || !canSend) return;
		setBusy(true);
		const known = new Set(overview.tasks.map(task => task.id));
		try {
			if (compare) {
				const ids: string[] = [];
				for (const selection of selections) { const id = await startChat(api, command, known, { selection, mode: "chat", text: draft, images }); if (id) ids.push(id); }
				if (ids.length) {
					const group = { id: crypto.randomUUID(), title: draft.trim().split("\n")[0].slice(0, 80) || "Model comparison", taskIds: ids, createdAt: new Date().toISOString() };
					saveCompareGroup(group); setDraft(""); setImages([]); openCompare(group.id);
				}
			} else {
				const id = await startChat(api, command, known, { selection: selections[0], mode: code ? planMode : "chat", projectId: code ? project?.id : undefined, permissionMode: code ? permissionMode : undefined, text: draft, images });
				if (id) { setDraft(""); setImages([]); select(id); }
			}
		} catch (reason) { setError(errorText(reason)); }
		finally { setBusy(false); }
	}

	function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => !!file);
		if (!files.length) return;
		event.preventDefault();
		if (files.some(file => file.size > 10 * 1024 * 1024) || files.length + images.length > 10) { setError("Attach up to 10 images, each under 10 MB."); return; }
		setImages(current => [...current, ...files]);
	}

	const addProject = () => { if (api) void api.chooseProject().then(state => { setOverview(state); const added = state.projects.find(value => !overview.projects.some(existing => existing.id === value.id)); if (added) setNewChatProjectId(added.id); }, reason => setError(errorText(reason))); };

	if (needsSignIn) return <div className="flex h-full items-center justify-center p-8"><SignInCard onOpenSettings={() => openSettings("accounts")} /></div>;

	const projectMenu = <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className={cn("flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-semibold shadow-xs hover:bg-muted", !project && "text-muted-foreground")} />}>
			<FolderOpen className="size-4" />{project?.name ?? "Choose a project"}<ChevronDown className="size-3.5 text-muted-foreground" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="center" className="w-60">
			{projects.map(value => <DropdownMenuItem key={value.id} onClick={() => setNewChatProjectId(value.id)}><FolderOpen />{value.name}{value.id === project?.id && <Check className="ml-auto" />}</DropdownMenuItem>)}
			{projects.length > 0 && <DropdownMenuSeparator />}
			<DropdownMenuItem onClick={addProject}><FolderPlus />Open folder…</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;

	return <div className="scrollbar-thin flex h-full flex-col items-center overflow-y-auto px-8">
		<div className="flex w-full max-w-[720px] flex-1 flex-col justify-center gap-6 py-12">
			<div className="text-center">
				<h1 className="text-[28px] font-bold tracking-tight">{code ? "What should we build?" : greeting()}</h1>
				{code && <div className="mt-4 flex justify-center">{projectMenu}</div>}
			</div>
			<Composer size="large" inputRef={input} value={draft} onChange={setDraft} onSubmit={() => void submit()} onPaste={paste} disabled={busy} canSend={canSend}
				placeholder={compare ? "Ask every model the same question…" : code ? (project ? `Describe a change to ${project.name}…` : "Choose a project, then describe what to build…") : "Message Phaseo…"}
				chips={compare || images.length ? <>
					{compare && selections.map(value => <ComposerChip key={value.harness + value.model} onRemove={() => setSelections(current => current.filter(item => !sameSelection(item, value)))}>
						<span className="mr-1 inline-flex size-3.5 align-[-2px] [&_img]:size-3.5 [&_.harness-logo]:size-3.5"><ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} /></span>{knownModel(value.model)?.name ?? modelLabel(value.model)}
					</ComposerChip>)}
					{images.map((file, index) => <ComposerChip key={index} onRemove={() => setImages(current => current.filter((_, position) => position !== index))}><ImageIcon className="mr-1 inline size-3" />{file.name}</ComposerChip>)}
				</> : undefined}
				tools={code ? <><PlanToggle value={planMode} onChange={setPlanMode} /><PermissionMenu value={permissionMode} onChange={setPermissionMode} /></> : undefined}
				model={<><ModelPicker selections={selections} onChange={setSelections} multiple={!code} agents={code} disabled={busy} />{selections.length === 1 && <ModelSettings selection={selections[0]} onChange={next => setSelections([next])} disabled={busy} />}</>}
				footer={compare && <p className="mt-2 px-2 text-xs text-muted-foreground">Sends to {selections.length} models side by side. Each answer is billed separately.</p>} />
			{!code && <div className="flex flex-wrap justify-center gap-2">
				{suggestions.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => { setDraft(prompt); requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(prompt.length, prompt.length); }); }}
					className="flex h-8 items-center gap-2 rounded-full border border-border px-3.5 text-[13px] text-foreground/85 transition-colors hover:bg-muted"><Icon className="size-3.5 text-muted-foreground" />{label}</button>)}
			</div>}
			{!code && recent.length > 0 && <div className="flex flex-wrap items-center justify-center gap-1">
				<span className="mr-1 text-xs font-semibold text-muted-foreground">Recent</span>
				{recent.map(value => {
					const active = selections.some(item => sameSelection(item, value));
					return <button key={value.harness + value.model} type="button" title={`${window.phaseoDesktop?.platform === "darwin" ? "⌘" : "Ctrl"}-click to compare`}
						onClick={event => setSelections(event.ctrlKey || event.metaKey ? (active ? (selections.length > 1 ? selections.filter(item => !sameSelection(item, value)) : selections) : [...selections, value].slice(0, MAX_COMPARE)) : [value])}
						className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", active && "text-foreground")}>
						<span className="flex size-4 items-center justify-center [&_img]:size-3.5 [&_.harness-logo]:size-3.5"><ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} /></span>
						{knownModel(value.model)?.name ?? modelLabel(value.model)}
					</button>;
				})}
			</div>}
			{code && !projects.length && <p className="text-center text-sm text-muted-foreground"><button type="button" onClick={addProject} className="font-semibold text-primary hover:underline">Open a folder</button> to give the agent a project to work in.</p>}
			{code && <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Code2 className="size-3.5" />Code chats can read and edit files, run commands and use your MCP tools.</p>}
		</div>
	</div>;
}
