import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Blocks, File, FileText, Folder, LoaderCircle, MessageSquare, Sparkles, Terminal } from "lucide-react";
import type { Attachment, Harness } from "../../shared/workspace";
import { nativeActionPrefix, nativeActionText, type NativeAction, type NativeActionEntry } from "../../shared/nativeActions";
import { findTrigger, resolveSlash } from "../lib/composerTriggers";
import type { PromptCommand } from "../../shared/promptCommands";
import type { McpPromptEntry } from "../../shared/mcpPrompts";
import type { ProjectFile } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { ModelStack } from "./ModelPicker";
import { ComposerChip } from "./Composer";

const nativeHarnesses: Harness[] = ["opencode", "pi", "claude", "codex", "phaseo"];
const takesArguments = (template: string) => /\$(ARGUMENTS|\d+)/.test(template);
const matches = (query: string, ...values: (string | undefined)[]) => { const needle = query.toLowerCase(); return values.some(value => value?.toLowerCase().includes(needle)); };
/** Name prefixes first, then names containing the query; descriptions only count once the query is specific. */
function rank<T>(values: T[], query: string, name: (value: T) => string, description: (value: T) => string | undefined) {
	const needle = query.toLowerCase();
	const score = (value: T) => { const label = name(value).toLowerCase(); return label.startsWith(needle) ? 3 : label.includes(needle) ? 2 : needle.length >= 3 && description(value)?.toLowerCase().includes(needle) ? 1 : 0; };
	return values.map(value => ({ value, score: score(value) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).map(entry => entry.value);
}

type Item = { key: string; group: string; label: string; detail?: string; hint?: string; icon: ReactNode; run: () => void | Promise<void> };

export function useComposerMenu({ value, onChange, input, taskId, harness, accountId, projectId, references, onReference, onAttachments }: {
	value: string;
	onChange: (value: string) => void;
	input: RefObject<HTMLTextAreaElement | null>;
	/** The chat being replied to; a new chat passes its harness, account and project instead. */
	taskId?: string;
	harness?: Harness;
	accountId?: string;
	projectId?: string;
	references: string[];
	onReference: (id: string) => void;
	onAttachments?: (attachments: Attachment[]) => void;
}) {
	const { api, overview, setError } = useWorkspace();
	const [caret, setCaret] = useState(0);
	const [dismissed, setDismissed] = useState<string>();
	const [active, setActive] = useState(0);
	const [commands, setCommands] = useState<PromptCommand[]>([]);
	const [actions, setActions] = useState<NativeActionEntry[]>([]);
	const [prompts, setPrompts] = useState<McpPromptEntry[]>([]);
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState<{ prompt: McpPromptEntry; values: Record<string, string> }>();
	// Native commands and skills only run when picked from the menu; typing their name sends plain text.
	const picked = useRef(new Set<string>());
	const listId = useRef(`composer-menu-${Math.random().toString(36).slice(2)}`).current;

	const trigger = useMemo(() => findTrigger(value, caret), [value, caret]);
	const triggerKey = trigger ? `${trigger.kind}:${trigger.start}` : undefined;
	const open = !!trigger && dismissed !== triggerKey;
	// Escape hides the menu until its trigger text is gone; a later `/` or `@` opens it again.
	useEffect(() => { if (!triggerKey) setDismissed(undefined); }, [triggerKey]);
	const slashOpen = open && trigger?.kind === "slash";
	const native = !!harness && nativeHarnesses.includes(harness);
	const source = `${taskId ?? ""}|${harness ?? ""}|${accountId ?? ""}|${projectId ?? ""}`;

	// Commands load when the slash menu opens, and again on each reopen so new skills and prompts appear.
	useEffect(() => {
		if (!slashOpen || !api) return;
		let current = true; setLoading(true);
		const nativeTarget = taskId ?? (harness ? { harness, accountId, projectId } : undefined);
		void Promise.allSettled([
			api.promptCommands(projectId, { type: "list" }).then(result => { if (current && "commands" in result) setCommands(result.commands); }),
			native && nativeTarget ? api.nativeActions(nativeTarget).then(result => { if (current) setActions(result.actions); }) : Promise.resolve(setActions([])),
			taskId ? api.mcpPrompts(taskId, { type: "list", requestId: crypto.randomUUID() }).then(result => { if (current && "prompts" in result) setPrompts(result.prompts); }) : Promise.resolve(setPrompts([])),
		]).finally(() => { if (current) setLoading(false); });
		return () => { current = false; };
	}, [slashOpen, source]);

	const mentionQuery = open && trigger?.kind === "mention" ? trigger.query : undefined;
	useEffect(() => {
		if (mentionQuery === undefined || !projectId || !api) { setFiles([]); return; }
		let current = true;
		const timer = setTimeout(() => void api.searchFiles(projectId, mentionQuery).then(result => { if (current) setFiles(result); }, () => { if (current) setFiles([]); }), 80);
		return () => { current = false; clearTimeout(timer); };
	}, [mentionQuery, projectId, api]);

	/** Replace the trigger text, keeping the rest of the message and putting the caret after the insertion. */
	const replace = (text: string, whole = false) => {
		if (!trigger) return;
		const next = whole ? text : value.slice(0, trigger.start) + text + value.slice(trigger.end);
		const position = whole ? next.length : trigger.start + text.length;
		onChange(next); setCaret(position);
		requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(position, position); });
	};
	const insertPrompt = async (prompt: McpPromptEntry, values: Record<string, string>) => {
		if (!api || !taskId) return;
		const preview = await api.mcpPrompts(taskId, { type: "preview", connectionId: prompt.connectionId, name: prompt.name, arguments: values, requestId: crypto.randomUUID() });
		if (!("messages" in preview)) return;
		if (preview.insertionError) throw new Error(preview.insertionError);
		const draft = await api.mcpPromptAttachments(taskId, preview.messages);
		if (draft.attachments.length) onAttachments?.(draft.attachments);
		replace(draft.text, true); setForm(undefined);
	};
	const guard = (run: () => Promise<void> | void) => async () => { try { await run(); } catch (reason) { setError(errorText(reason)); } };

	const items = useMemo((): Item[] => {
		if (!open || !trigger) return [];
		const query = trigger.query;
		if (trigger.kind === "slash") return [
			...rank(commands, query, command => command.name, command => command.description).map(command => ({
				key: `prompt:${command.scope}:${command.name}`, group: "Saved prompts", label: `/${command.name}`, detail: command.description, hint: command.scope === "project" ? "Project" : undefined, icon: <FileText />,
				run: guard(async () => {
					const preview = await api!.promptCommands(projectId, { type: "preview", scope: command.scope, name: command.name, arguments: "" });
					if (!("template" in preview)) return;
					// Prompts that take arguments stay as `/name ` so the arguments can be typed; the rest expand now.
					if (takesArguments(preview.template)) replace(`/${command.name} `); else replace(preview.text, true);
				}),
			})),
			...rank(actions.filter(action => !action.name.startsWith("__")), query, action => nativeActionPrefix(action).slice(1), action => action.description).map(action => ({
				key: `native:${action.kind}:${action.id}`, group: action.kind === "skill" ? "Skills" : "Commands", label: nativeActionPrefix(action), detail: action.description, hint: action.argumentHint, icon: action.kind === "skill" ? <Sparkles /> : <Terminal />,
				run: () => { picked.current.add(nativeActionPrefix(action)); replace(`${nativeActionPrefix(action)} `); },
			})),
			...rank(prompts, query, prompt => prompt.name, prompt => `${prompt.server} ${prompt.description}`).map(prompt => ({
				key: `mcp:${prompt.connectionId}:${prompt.name}`, group: "MCP prompts", label: prompt.name, detail: prompt.description, hint: prompt.server, icon: <Blocks />,
				run: guard(async () => { if (prompt.arguments.length) setForm({ prompt, values: {} }); else await insertPrompt(prompt, {}); }),
			})),
		].slice(0, 60);
		const chats = overview.tasks.filter(task => !task.archived && task.id !== taskId && !references.includes(task.id) && matches(query, task.title))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, query ? 8 : 5);
		return [
			...chats.map(task => ({ key: `chat:${task.id}`, group: "Chats", label: task.title, icon: <ModelStack models={[task]} size="sm" ringClassName="ring-transparent" />,
				run: () => { onReference(task.id); replace(""); } })),
			...files.map(file => ({ key: `file:${file.path}`, group: "Files", label: file.name, detail: file.path === file.name ? undefined : file.path, icon: file.directory ? <Folder /> : <File />,
				run: () => replace(`@${file.path}${file.directory ? "/" : ""} `) })),
		];
	}, [open, trigger, commands, actions, prompts, files, overview.tasks, references, taskId]);

	useEffect(() => { setActive(0); }, [triggerKey, trigger?.query]);
	const selected = Math.min(active, Math.max(0, items.length - 1));
	useEffect(() => { document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, listId]);

	/** Runs before the composer's own keys: the menu takes arrows, Enter, Tab and Escape while open. */
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (!open || form || event.nativeEvent.isComposing) return;
		if (event.key === "Escape") { event.preventDefault(); setDismissed(triggerKey); return; }
		if (!items.length) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length); }
		else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") { event.preventDefault(); void items[selected].run(); }
	};

	/** At send time, a typed `/name args` becomes the saved prompt's text or a native command. */
	const prepare = async (text: string): Promise<{ text: string; nativeAction?: NativeAction }> => {
		const resolved = resolveSlash(text, commands, native ? actions.filter(action => picked.current.has(nativeActionPrefix(action))) : []);
		if (resolved?.action) return { text: nativeActionText(resolved.action), nativeAction: resolved.action };
		if (resolved?.command && api) {
			const preview = await api.promptCommands(projectId, { type: "preview", scope: resolved.command.scope, name: resolved.command.name, arguments: resolved.arguments });
			if ("text" in preview) return { text: preview.text };
		}
		return { text };
	};

	const empty = trigger?.kind === "slash" ? (loading ? "" : "No commands match.") : projectId ? "No chats or files match." : "No chats match.";
	let previous = "";
	const menu = open ? <div role="dialog" aria-label={trigger?.kind === "slash" ? "Commands" : "Mention a chat or file"} className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
		{form ? <form className="flex flex-col gap-2 p-3" onSubmit={event => { event.preventDefault(); void guard(() => insertPrompt(form.prompt, form.values))(); }}>
			<p className="text-[13px] font-semibold">{form.prompt.name} <span className="font-normal text-muted-foreground">· {form.prompt.server}</span></p>
			{form.prompt.arguments.map((argument, index) => <label key={argument.name} className="flex flex-col gap-1 text-xs text-muted-foreground">
				<span>{argument.name}{argument.required ? "" : " (optional)"}{argument.description ? ` · ${argument.description}` : ""}</span>
				<input autoFocus={index === 0} required={argument.required} value={form.values[argument.name] ?? ""} onChange={event => setForm({ ...form, values: { ...form.values, [argument.name]: event.target.value } })}
					onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setForm(undefined); input.current?.focus(); } }}
					className="h-8 rounded-md border border-input bg-input/40 px-2 text-[13px] text-foreground outline-none focus:border-ring" />
			</label>)}
			<div className="flex justify-end gap-1.5">
				<button type="button" onClick={() => { setForm(undefined); input.current?.focus(); }} className="h-7 rounded-md px-2.5 text-xs font-medium hover:bg-muted">Back</button>
				<button type="submit" className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/85">Insert</button>
			</div>
		</form> : <ScrollArea className="max-h-72" viewportClassName="max-h-72">
			<div id={listId} role="listbox" aria-label={trigger?.kind === "slash" ? "Commands" : "Chats and files"} className="py-1.5 pr-3.5 pl-1.5">
				{items.map((item, index) => {
					const heading = item.group !== previous ? item.group : undefined; previous = item.group;
					return <div key={item.key}>
						{heading && <p className="px-2 pt-1.5 pb-1 text-xs font-bold text-foreground/70">{heading}</p>}
						<div id={`${listId}-${index}`} role="option" aria-selected={index === selected} onMouseMove={() => { if (index !== selected) setActive(index); }}
							onMouseDown={event => event.preventDefault()} onClick={() => void item.run()}
							className={cn("flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground", index === selected && "bg-muted")}>
							{item.icon}
							<span className="shrink-0 truncate font-medium">{item.label}</span>
							{item.detail && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
							{item.hint && <span className="ml-auto max-w-40 shrink-0 truncate pl-2 text-[11px] text-muted-foreground">{item.hint}</span>}
						</div>
					</div>;
				})}
				{!items.length && (loading ? <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading commands…</p> : <p className="px-2 py-2 text-xs text-muted-foreground">{empty}</p>)}
			</div>
		</ScrollArea>}
	</div> : null;

	return { menu, onKeyDown, onCaret: setCaret, prepare, expanded: open && !form && items.length > 0, activeId: open && !form && items.length ? `${listId}-${selected}` : undefined, listId };
}
export type ComposerMenu = ReturnType<typeof useComposerMenu>;

/** Referenced chats shown above the message; the agent can read them with read_thread. */
export function ReferenceChips({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
	const { overview } = useWorkspace();
	return <>{ids.map(id => <ComposerChip key={id} title="The agent can read this chat" onRemove={() => onRemove(id)}><MessageSquare className="mr-1 inline size-3" />{overview.tasks.find(task => task.id === id)?.title ?? "Chat"}</ComposerChip>)}</>;
}
