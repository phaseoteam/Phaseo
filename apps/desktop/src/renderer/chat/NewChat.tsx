import { useEffect, useMemo, useState } from "react";
import { BookOpen, Box, Check, ChevronDown, Code2, FilePen, FolderOpen, FolderPlus, Gauge, Lightbulb, ListChecks, PenLine, Plug, Search, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { ScrollArea } from "../components/ui/scroll-area";
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
import { useComposerMenu } from "./ComposerMenu";
import { openModelPickerEvent, useModelSettingActions, type ComposerAction } from "./composerActions";
import { useComposerEditor } from "./composerEditor";
import { composeMessage } from "../lib/mentions";
import { MAX_COMPARE, ModelPicker, knownModel, modelLabel, sameSelection } from "./ModelPicker";
import { ModelSettings } from "./ModelSettings";
import { SignInCard } from "./SignInCard";
import { startChat } from "./startChat";
import { newChatDraftEvent, newChatDraftKey } from "../lib/newChatDraft";

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
	const full = value === "full-access", edits = value === "accept-edits";
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium hover:bg-muted [&_svg]:size-4", full ? "text-warning" : "text-muted-foreground hover:text-foreground")} />}>
			{full ? <ShieldAlert /> : <ShieldCheck />}{full ? "Full access" : edits ? "Accept edits" : "Ask first"}<ChevronDown className="size-3!" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" side="top" className="w-72">
			<DropdownMenuItem onClick={() => onChange("supervised")} className="items-start"><ShieldCheck className="mt-0.5" /><span><span className="block font-semibold">Ask first</span><span className="text-xs text-muted-foreground">Approve commands and file changes before they run.</span></span>{!full && !edits && <Check className="ml-auto" />}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => onChange("accept-edits")} className="items-start"><FilePen className="mt-0.5" /><span><span className="block font-semibold">Accept edits</span><span className="text-xs text-muted-foreground">File changes apply without asking; commands still ask first.</span></span>{edits && <Check className="ml-auto" />}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => onChange("full-access")} className="items-start"><ShieldAlert className="mt-0.5 text-warning" /><span><span className="block font-semibold">Full access</span><span className="text-xs text-muted-foreground">The agent runs commands and edits files without asking.</span></span>{full && <Check className="ml-auto" />}</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

/** Shown only while plan mode is on (it is turned on from /); clicking it turns plan mode off. */
export function PlanIndicator({ onClear }: { onClear?: () => void }) {
	return <ToolButton label="Plan mode is on: the agent proposes a plan before changing anything. Click to turn it off." active disabled={!onClear} onClick={onClear}><ListChecks />Plan</ToolButton>;
}

export function NewChat() {
	const { api, overview, command, setOverview, setError, mode, select, openCompare, saveCompareGroup, newChatProjectId, setNewChatProjectId, openSettings } = useWorkspace();
	const [draft, setDraft] = usePersistedState(newChatDraftKey, "");
	// Images wait here until the chat exists; the draft holds a chip for each, keyed by a local id.
	const [images, setImages] = useState<Record<string, File>>({});
	const [busy, setBusy] = useState(false);

	const [planMode, setPlanMode] = usePersistedState<Task["mode"]>("phaseo.desktop.draftMode", "code");
	const [permissionMode, setPermissionMode] = usePersistedState<NonNullable<Task["permissionMode"]>>("phaseo.desktop.draftPermissions", "supervised");
	const preferences = useModelPreferences();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const connected = useConnectedHarnesses();
	const { models: phaseoModels } = useModels("phaseo", phaseoAccount?.id, undefined, undefined, !!phaseoAccount);
	const remembered = preferences.defaultSelection ?? preferences.recentSelection;
	const [selections, setSelections] = useState<ModelSelection[]>(remembered ? [remembered] : []);
	const code = mode === "code";
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const project = projects.find(value => value.id === newChatProjectId);

	useEffect(() => {
		if (selections.length || !phaseoAccount || !phaseoModels.length) return;
		const model = phaseoModels.find(value => value.default) ?? phaseoModels.find(value => /claude-sonnet|gpt-6\b/i.test(value.id)) ?? phaseoModels[0];
		setSelections([{ harness: "phaseo", accountId: phaseoAccount.id, model: model.id }]);
	}, [selections.length, phaseoAccount, phaseoModels]);
	const compare = !code && selections.length > 1;
	const editor = useComposerEditor({ value: draft, onChange: setDraft, disabled: busy, onFiles: files => addImages(files),
		placeholder: compare ? "Ask every model the same question…" : code ? (project ? `Describe a change to ${project.name}…` : "Choose a project, then describe what to build…") : "Message Phaseo…" });
	// Native commands depend on one agent, so comparing models offers saved prompts, chats and files only.
	const plan = planMode === "plan", full = permissionMode === "full-access", edits = permissionMode === "accept-edits";
	const settingActions = useModelSettingActions(selections.length === 1 ? selections[0] : undefined, next => setSelections([next]));
	const actions: ComposerAction[] = [
		{ id: "mcp", label: "MCP", description: "Manage MCP servers", icon: <Plug />, run: () => openSettings("mcp") },
		{ id: "model", label: "Model", description: compare ? "Choose the models to compare" : "Choose the model", icon: <Box />, run: () => window.dispatchEvent(new Event(openModelPickerEvent)) },
		...code ? [
			{ id: "plan", label: "Plan mode", description: plan ? "Turn plan mode off" : "Turn plan mode on: the agent proposes a plan before changing anything", icon: <ListChecks />, checked: plan, run: () => setPlanMode(plan ? "code" : "plan") },
			{ id: "permissions", label: "Permissions", hint: full ? "Full access" : edits ? "Accept edits" : "Ask first", icon: <ShieldCheck />, options: [
				{ id: "permissions:supervised", label: "Ask first", description: "Approve commands and file changes before they run", icon: null, checked: !full && !edits, run: () => setPermissionMode("supervised") },
				{ id: "permissions:accept-edits", label: "Accept edits", description: "File changes apply without asking; commands still ask first", icon: null, checked: edits, run: () => setPermissionMode("accept-edits") },
				{ id: "permissions:full-access", label: "Full access", description: "The agent runs commands and edits files without asking", icon: null, checked: full, run: () => setPermissionMode("full-access") },
			] },
		] : [],
		{ id: "accounts", label: "Accounts", description: "Manage accounts and usage", icon: <UserRound />, run: () => openSettings("accounts") },
		{ id: "usage", label: "Usage", description: "Open usage and limits", icon: <Gauge />, run: () => openSettings("usage") },
		...settingActions,
	];
	const menu = useComposerMenu({ editor, harness: compare ? undefined : selections[0]?.harness, accountId: selections[0]?.accountId, projectId: code ? project?.id : undefined, actions });
	const message = composeMessage(draft);
	useEffect(() => { editor.focus(); }, [mode, editor.editor]); // Focus follows the mode switch and the editor's first mount.
	// A pull request hand-off (Ask, Explain, Fix findings) puts its task here for the person to read over and send.
	useEffect(() => {
		const receive = (event: Event) => { const text = (event as CustomEvent<{ text?: unknown }>).detail?.text; if (typeof text !== "string") return; setDraft(text); setPlanMode("code"); requestAnimationFrame(() => editor.focus("end")); };
		window.addEventListener(newChatDraftEvent, receive); return () => window.removeEventListener(newChatDraftEvent, receive);
	}, [editor, setDraft, setPlanMode]);
	const attached = message.images.flatMap(id => images[id] ? [images[id]] : []);
	useEffect(() => { if (code) setSelections(current => current.length > 1 ? current.slice(0, 1) : current); }, [code]);

	const recent = useMemo(() => {
		const seen: ModelSelection[] = [];
		for (const value of [preferences.defaultSelection, ...preferences.recent]) if (value && !seen.some(item => sameSelection(item, value))) seen.push(value);
		return seen.slice(0, 3);
	}, [preferences]);

	const needsSignIn = !phaseoAccount && ![...connected].some(harness => harness !== "phaseo");
	const canSend = !busy && (!!message.text || attached.length > 0) && selections.length > 0 && (!code || !!project);

	async function submit() {
		if (!api || !canSend) return;
		setBusy(true);
		const known = new Set(overview.tasks.map(task => task.id));
		try {
			const prepared = await menu.prepare(message.text), shared = { text: prepared.text, images: attached, threadReferences: message.threadReferences, nativeAction: prepared.nativeAction };
			if (compare) {
				const ids: string[] = [];
				for (const selection of selections) { const id = await startChat(api, command, known, { selection, mode: "chat", ...shared }); if (id) ids.push(id); }
				if (ids.length) {
					const group = { id: crypto.randomUUID(), title: draft.trim().split("\n")[0].slice(0, 80) || "Model comparison", taskIds: ids, createdAt: new Date().toISOString() };
					saveCompareGroup(group); setDraft(""); setImages({}); openCompare(group.id);
				}
			} else {
				const id = await startChat(api, command, known, { selection: selections[0], mode: code ? planMode : "chat", projectId: code ? project?.id : undefined, permissionMode: code ? permissionMode : undefined, ...shared });
				if (id) { setDraft(""); setImages({}); select(id); }
			}
		} catch (reason) { setError(errorText(reason)); }
		finally { setBusy(false); }
	}

	function addImages(files: File[]) {
		const added = files.filter(file => file.type.startsWith("image/"));
		if (added.length < files.length) setError("Add other files once the chat has started.");
		if (!added.length) return;
		if (added.some(file => file.size > 10 * 1024 * 1024) || added.length + attached.length > 10) { setError("Attach up to 10 images, each under 10 MB."); return; }
		const entries = added.map(file => [crypto.randomUUID(), file] as const);
		setImages(current => ({ ...current, ...Object.fromEntries(entries) }));
		editor.insert(entries.map(([id, file]) => ({ kind: "image", ref: id, label: file.name })));
	}

	const addProject = () => { if (api) void api.chooseProject().then(state => { setOverview(state); const added = state.projects.find(value => !overview.projects.some(existing => existing.id === value.id)); if (added) setNewChatProjectId(added.id); }, reason => setError(errorText(reason))); };

	if (needsSignIn) return <div className="flex h-full items-center justify-center p-8"><SignInCard onOpenSettings={() => openSettings("accounts")} /></div>;

	const projectMenu = <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className={cn("flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-semibold shadow-xs hover:bg-muted", !project && "text-muted-foreground")} />}>
			{project ? <ProjectIcon project={project} className="size-4" /> : <FolderOpen className="size-4" />}{project?.name ?? "Choose a project"}<ChevronDown className="size-3.5 text-muted-foreground" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="center" className="w-60">
			{projects.map(value => <DropdownMenuItem key={value.id} onClick={() => setNewChatProjectId(value.id)}><ProjectIcon project={value} />{value.name}{value.id === project?.id && <Check className="ml-auto" />}</DropdownMenuItem>)}
			{projects.length > 0 && <DropdownMenuSeparator />}
			<DropdownMenuItem onClick={addProject}><FolderPlus />Open folder…</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;

	return <ScrollArea className="h-full" viewportClassName="[&>div]:min-h-full [&>div]:flex [&>div]:flex-col"><div className="flex flex-1 flex-col items-center px-8">
		<div className="flex w-full max-w-[720px] flex-1 flex-col justify-center gap-6 py-12">
			<div className="text-center">
				<h1 className="text-[28px] font-bold tracking-tight">{code ? "What should we build?" : greeting()}</h1>
				{code && <div className="mt-4 flex justify-center">{projectMenu}</div>}
			</div>
			<Composer size="large" editor={editor} onSubmit={() => void submit()} disabled={busy} canSend={canSend}
				menu={menu}
				chips={compare ? <>
					{compare && selections.map(value => <ComposerChip key={value.harness + value.model} onRemove={() => setSelections(current => current.filter(item => !sameSelection(item, value)))}>
						<span className="mr-1 inline-flex size-3.5 align-[-2px] [&_img]:size-3.5 [&_.harness-logo]:size-3.5"><ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} /></span>{knownModel(value.model)?.name ?? modelLabel(value.model)}
					</ComposerChip>)}
				</> : undefined}
				tools={<>
					<ModelPicker selections={selections} onChange={setSelections} multiple={!code} agents={code} disabled={busy} openEvent={openModelPickerEvent} />
					{selections.length === 1 && <ModelSettings selection={selections[0]} onChange={next => setSelections([next])} disabled={busy} />}
					{code && <PermissionMenu value={permissionMode} onChange={setPermissionMode} />}
					{code && plan && <PlanIndicator onClear={() => setPlanMode("code")} />}
				</>}
				footer={compare && <p className="mt-2 px-2 text-xs text-muted-foreground">Sends to {selections.length} models side by side. Each answer is billed separately.</p>} />
			{!code && <div className="flex flex-wrap justify-center gap-2">
				{suggestions.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => { setDraft(prompt); requestAnimationFrame(() => editor.focus("end")); }}
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
	</div></ScrollArea>;
}
