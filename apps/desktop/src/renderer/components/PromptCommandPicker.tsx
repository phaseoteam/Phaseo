import { useBackgroundRefresh } from "../lib/useBackgroundRefresh";
import type { McpPromptPreview } from "../../shared/mcpPrompts";
import { Select } from "./Select";
import { McpPromptPicker } from "./McpPromptPicker";
import { NativeActionPicker } from "./NativeActionPicker";
import type { NativeAction } from "../../shared/nativeActions";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Search, X, FileText, ChevronRight, Blocks, Terminal, Paperclip, Upload, SquarePen } from "lucide-react";
import type { PromptCommand, PromptCommandCatalog, PromptCommandPreview } from "../../shared/promptCommands";
export function PromptCommandPicker({ projectId, taskId, native, onClose, onInsert, inline = false, composerQuery = "", composerDriven = false, onAttach, onImport, onCreate }: { onImport?: () => void; onCreate?: () => void; onAttach?: () => void; inline?: boolean; composerQuery?: string; composerDriven?: boolean; projectId?: string; taskId: string; native?: "opencode" | "pi" | "claude" | "codex" | "phaseo"; onClose: () => void; onInsert: (text: string, action?: NativeAction, prompt?: McpPromptPreview) => void | Promise<void> }) {
 const [tab, setTab] = useState<"saved" | "native" | "mcp">("saved");
 const api = window.phaseoDesktop?.workspace; const dialog = useRef<HTMLDialogElement>(null); const operation = useRef(0); const pending = useRef(false);
 const [catalog, setCatalog] = useState<PromptCommandCatalog>({ commands: [], errors: [] }); const [query, setQuery] = useState(""); const [index, setIndex] = useState(0); const [attempt, setAttempt] = useState(0);
 const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [preview, setPreview] = useState<PromptCommandPreview>(); const [argumentsValue, setArguments] = useState("");
 const [previewArguments, setPreviewArguments] = useState("");
 const [editing, setEditing] = useState(false); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [template, setTemplate] = useState(""); const [scope, setScope] = useState<PromptCommand["scope"]>(projectId ? "project" : "global"); const [hash, setHash] = useState("new");
 useEffect(() => { const element = dialog.current; const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined; if (inline) { if (element && !element.open) element.show(); } else element?.showModal(); if (!inline || trigger?.tagName !== "TEXTAREA") element?.querySelector<HTMLInputElement>('[aria-label="Search chat commands"]')?.focus(); return () => { operation.current++; element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }; }, [inline]);
 useEffect(() => { if (inline) { setQuery(composerQuery); setIndex(0); } }, [inline, composerQuery]);
 useEffect(() => {
  if (!inline) return;
  const outside = (event: PointerEvent) => {
   const target = event.target;
   if (!(target instanceof Element) || dialog.current?.closest(".chat-composer-dock")?.contains(target) || target.closest('[data-slot="select-positioner"], [role="listbox"], [role="menu"]')) return;
   onClose();
  };
  document.addEventListener("pointerdown", outside);
  return () => document.removeEventListener("pointerdown", outside);
 }, [inline, onClose]);
 useEffect(() => {
  if (!api) { setLoading(false); setError("Open the desktop app to load commands."); return; }
  let active = true; setLoading(true); setError(""); void api.promptCommands(projectId, { type: "list" }).then(value => { if (active && "commands" in value) setCatalog(value); }, reason => { if (active) setError(errorMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
 }, [api, projectId, attempt]);
 useBackgroundRefresh(() => { if (!loading && !busy && !pending.current && !preview && !editing) setAttempt(value => value + 1); });
 useEffect(() => { if (!preview && !editing && !inline) dialog.current?.querySelector<HTMLInputElement>('[aria-label="Search chat commands"]')?.focus(); if (inline && preview) dialog.current?.querySelector<HTMLInputElement>('[aria-label="Command arguments"]')?.focus(); }, [preview, editing, inline]);
 const commands = catalog.commands.filter(command => `${command.name} ${command.description} ${command.scope}`.toLowerCase().includes(query.toLowerCase())); const groups = composerDriven && tab === "saved" ? [{ id: "import" as const, label: "Import conversation", description: "Continue an existing conversation", icon: Upload, enabled: !!onImport }, { id: "create" as const, label: "Create chat", description: "Open a chat without sending", icon: SquarePen, enabled: !!onCreate }, { id: "attach" as const, label: "Add files", description: "Attach images or documents", icon: Paperclip, enabled: !!onAttach }, { id: "native" as const, label: "Commands and skills", description: "Browse runtime actions", icon: Terminal, enabled: !!native }, { id: "mcp" as const, label: "MCP", description: "Browse connected server prompts", icon: Blocks, enabled: !!taskId }].filter(group => group.enabled && `${group.label} ${group.description}`.toLowerCase().includes(query.toLowerCase())) : []; const selected = Math.max(0, Math.min(index, commands.length + groups.length - 1));
 useEffect(() => {
  if (!inline) return;
  const input = dialog.current?.closest(".chat-composer-dock")?.querySelector<HTMLTextAreaElement>('textarea');
  if (tab === "saved" && !preview && !editing && (commands.length + groups.length)) input?.setAttribute("aria-activedescendant", `chat-command-${selected}`); else input?.removeAttribute("aria-activedescendant");
  return () => input?.removeAttribute("aria-activedescendant");
 }, [inline, tab, preview, editing, commands.length, groups.length, selected]);
 useEffect(() => { document.getElementById(`chat-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, query, catalog]);
 async function load(command: PromptCommand, args = "") {
  if (!api || pending.current) return; pending.current = true; setBusy(true); setError(""); const token = ++operation.current;
  try { const value = await api.promptCommands(projectId, { type: "preview", scope: command.scope, name: command.name, arguments: args }); if (token === operation.current && "text" in value) { if (composerDriven && !/\$(ARGUMENTS|\d+)/.test(value.template)) { await onInsert(value.text); onClose(); } else { setPreview(value); setArguments(args); setPreviewArguments(args); } } }
  catch (reason) { if (token === operation.current) setError(errorMessage(reason)); }
  finally { if (token === operation.current) { pending.current = false; setBusy(false); } }
 }
 useEffect(() => {
  if (!inline) return;
  const keydown = (event: KeyboardEvent) => {
   if (event.isComposing || event.repeat || !(event.target instanceof HTMLTextAreaElement) || !["Message", "New chat message"].includes(event.target.getAttribute("aria-label") ?? "")) return;
   if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
   if (tab !== "saved" || preview || editing) return;
   if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex(value => Math.max(0, Math.min(commands.length + groups.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); }
   if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); if (groups[selected]) { if (groups[selected].id === "import") { onClose(); onImport?.(); } else if (groups[selected].id === "create") { onClose(); onCreate?.(); } else if (groups[selected].id === "attach") { onClose(); onAttach?.(); } else { setTab(groups[selected].id); setIndex(0); } } else if (commands[selected - groups.length]) void load(commands[selected - groups.length]); }
  };
  document.addEventListener("keydown", keydown, true);
  return () => document.removeEventListener("keydown", keydown, true);
 });
 function edit(command?: PromptCommandPreview) { setEditing(true); setError(""); setName(command?.name ?? ""); setDescription(command?.description ?? ""); setTemplate(command?.template ?? ""); setScope(command?.scope ?? (projectId ? "project" : "global")); setHash(command?.hash ?? "new"); }
 async function save() {
  if (!api || pending.current) return; pending.current = true; setBusy(true); setError(""); const token = ++operation.current;
  try { const value = await api.promptCommands(projectId, { type: "save", scope, name, description, template, expectedHash: hash }); if (token === operation.current && "text" in value) { setEditing(false); setPreview(value); setArguments(""); setPreviewArguments(""); setAttempt(value => value + 1); } }
  catch (reason) { if (token === operation.current) setError(errorMessage(reason)); }
  finally { if (token === operation.current) { pending.current = false; setBusy(false); } }
 }
 return <dialog open={inline || undefined} className={`prompt-command-dialog${inline ? " composer-command-menu" : ""}${composerDriven && !editing && !preview ? " composer-driven" : ""}`} ref={dialog} aria-label="Chat commands" onKeyDown={event => { if (inline && event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); } }} onCancel={event => { event.preventDefault(); onClose(); }}>
  <div className="prompt-command-heading"><h2>{editing ? hash === "new" ? "New command" : "Edit command" : preview ? `/${preview.name}` : "Commands"}</h2><button type="button" aria-label="Close chat commands" onClick={onClose}><X size={16} /></button></div>
  {!composerDriven && !editing && !preview && <div className="prompt-command-actions"><button type="button" aria-pressed={tab === "saved"} className={tab === "saved" ? "task-primary" : undefined} onClick={() => setTab("saved")} aria-label="Saved prompts"><span className={inline ? "composer-control-label" : undefined}>Saved </span>prompts</button>{native && <button type="button" aria-pressed={tab === "native"} className={tab === "native" ? "task-primary" : undefined} onClick={() => setTab("native")}>{native === "pi" ? "Pi" : native === "claude" ? "Claude" : native === "codex" ? "OpenAI" : native === "phaseo" ? "Phaseo" : "OpenCode"}</button>}{taskId && <button type="button" aria-pressed={tab === "mcp"} className={tab === "mcp" ? "task-primary" : undefined} onClick={() => setTab("mcp")} aria-label="MCP prompts">MCP<span className={inline ? "composer-control-label" : undefined}> prompts</span></button>}</div>}
  {composerDriven && tab !== "saved" && <button type="button" className="slash-menu-back" onClick={() => { setTab("saved"); setIndex(0); }}><ArrowLeft size={14} />Back</button>}
  {error && <p className="task-error" role="alert">{error}</p>}
  {tab === "mcp" ? <McpPromptPicker taskId={taskId} onInsert={async preview => { await onInsert(preview.text!, undefined, preview); onClose(); }} /> : tab === "native" ? <NativeActionPicker taskId={taskId} onInsert={(text, action) => { onInsert(text, action); onClose(); }} /> : editing ? <form className="prompt-command-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
   <label>Name<input aria-label="Command name" maxLength={64} required readOnly={hash !== "new"} value={name} onChange={event => setName(event.target.value)} placeholder="review" /></label>
   <label>Scope<Select label="Command scope" disabled={hash !== "new" || busy} value={scope} onValueChange={value => setScope(value as PromptCommand["scope"])} options={[{ value: "global", label: "All chats" }, ...(projectId ? [{ value: "project", label: "This project" }] : [])]} /></label>
   <label>Description<input aria-label="Command description" maxLength={240} value={description} onChange={event => setDescription(event.target.value)} /></label>
   <label>Template<textarea aria-label="Command template" required maxLength={16384} value={template} onChange={event => setTemplate(event.target.value)} placeholder="Review $ARGUMENTS and explain the findings." /></label>
   <small>Use $ARGUMENTS or $1, $2 for arguments.</small><div className="prompt-command-actions"><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="task-primary" disabled={busy || !name || !template.trim()}>{busy ? "Saving…" : "Save command"}</button></div>
  </form> : preview ? <div className="prompt-command-preview">
   <p className="task-muted">{preview.scope === "project" ? "This project · .phaseo/commands" : "All chats · commands"}/{preview.name}.md</p>
   {preview.description && <p>{preview.description}</p>}
   <label>Arguments<input aria-label="Command arguments" maxLength={10000} value={argumentsValue} disabled={busy} onChange={event => setArguments(event.target.value)} /></label>
   <button type="button" disabled={busy} onClick={() => void load(preview, argumentsValue)}>{busy ? "Loading…" : "Preview arguments"}</button>
   <pre aria-label="Command preview">{preview.text}</pre>
   <div className="prompt-command-actions"><button type="button" disabled={busy} onClick={() => { setPreview(undefined); setError(""); }}><ArrowLeft size={14} />Back</button><button type="button" disabled={busy} onClick={() => edit(preview)}>Edit</button><button type="button" className="task-primary" disabled={busy || argumentsValue !== previewArguments} onClick={() => { try { onInsert(preview.text); onClose(); } catch (reason) { setError(errorMessage(reason)); } }}>Insert into chat</button></div>
  </div> : <>
   <div className="prompt-command-search"><Search size={16} /><input aria-label="Search chat commands" role="combobox" aria-expanded="true" aria-controls="chat-command-results" aria-activedescendant={commands.length ? `chat-command-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex(value => Math.max(0, Math.min(commands.length + groups.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter" && commands[selected]) { event.preventDefault(); void load(commands[selected]); } }} placeholder="Search commands" /><button type="button" disabled={busy || loading} onClick={() => edit()}><Plus size={14} />New</button></div>
   {loading ? <p role="status">Loading commands…</p> : <div className="prompt-command-results" id="chat-command-results" role="listbox" aria-label="Chat commands">{groups.map((group, position) => <button type="button" role="option" aria-selected={position === selected} id={`chat-command-${position}`} key={group.id} onMouseEnter={() => setIndex(position)} onMouseDown={event => event.preventDefault()} onClick={() => { if (group.id === "import") { onClose(); onImport?.(); } else if (group.id === "create") { onClose(); onCreate?.(); } else if (group.id === "attach") { onClose(); onAttach?.(); } else { setTab(group.id); setIndex(0); } }}><group.icon size={14} aria-hidden="true" /><span><strong>{group.label}</strong><small>{group.description}</small></span>{(group.id === "native" || group.id === "mcp") && <ChevronRight size={14} />}</button>)}{commands.map((command, commandIndex) => { const position = commandIndex + groups.length; return <button type="button" role="option" aria-selected={position === selected} id={`chat-command-${position}`} key={`${command.scope}/${command.name}`} disabled={busy} onMouseEnter={() => setIndex(position)} onMouseDown={event => event.preventDefault()} onClick={() => void load(command)}><FileText size={14} aria-hidden="true" /><span><strong>/{command.name}</strong>{command.description && <small>{command.description}</small>}</span><small>{command.scope === "project" ? "Project" : "All chats"}</small></button>; })}{!commands.length && !groups.length && <p className="task-muted">{query ? "No matching commands." : "Save a prompt you use often as a command."}</p>}</div>}

   {catalog.errors.length > 0 && <details className="prompt-command-errors"><summary>Unavailable commands ({catalog.errors.length})</summary>{catalog.errors.map(error => <p key={error}>{error}</p>)}</details>}
  </>}
 </dialog>;
}
function errorMessage(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
