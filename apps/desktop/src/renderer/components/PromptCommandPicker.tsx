import { NativeActionPicker } from "./NativeActionPicker";
import type { NativeAction } from "../../shared/nativeActions";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import type { PromptCommand, PromptCommandCatalog, PromptCommandPreview } from "../../shared/promptCommands";
export function PromptCommandPicker({ projectId, taskId, native, onClose, onInsert }: { projectId?: string; taskId: string; native?: "opencode" | "pi" | "claude" | "codex"; onClose: () => void; onInsert: (text: string, action?: NativeAction) => void }) {
 const [nativeTab, setNativeTab] = useState(false);
 const api = window.phaseoDesktop?.workspace; const dialog = useRef<HTMLDialogElement>(null); const operation = useRef(0); const pending = useRef(false);
 const [catalog, setCatalog] = useState<PromptCommandCatalog>({ commands: [], errors: [] }); const [query, setQuery] = useState(""); const [index, setIndex] = useState(0); const [attempt, setAttempt] = useState(0);
 const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [preview, setPreview] = useState<PromptCommandPreview>(); const [argumentsValue, setArguments] = useState("");
 const [previewArguments, setPreviewArguments] = useState("");
 const [editing, setEditing] = useState(false); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [template, setTemplate] = useState(""); const [scope, setScope] = useState<PromptCommand["scope"]>(projectId ? "project" : "global"); const [hash, setHash] = useState("new");
 useEffect(() => { const element = dialog.current; const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined; element?.showModal(); element?.querySelector<HTMLInputElement>('[aria-label="Search chat commands"]')?.focus(); return () => { operation.current++; element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }; }, []);
 useEffect(() => {
  if (!api) { setLoading(false); setError("Open the desktop app to load commands."); return; }
  let active = true; setLoading(true); setError(""); void api.promptCommands(projectId, { type: "list" }).then(value => { if (active && "commands" in value) setCatalog(value); }, reason => { if (active) setError(errorMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
 }, [api, projectId, attempt]);
 useEffect(() => { if (!preview && !editing) dialog.current?.querySelector<HTMLInputElement>('[aria-label="Search chat commands"]')?.focus(); }, [preview, editing]);
 const commands = catalog.commands.filter(command => `${command.name} ${command.description} ${command.scope}`.toLowerCase().includes(query.toLowerCase())); const selected = Math.max(0, Math.min(index, commands.length - 1));
 useEffect(() => { document.getElementById(`chat-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, query, catalog]);
 async function load(command: PromptCommand, args = "") {
  if (!api || pending.current) return; pending.current = true; setBusy(true); setError(""); const token = ++operation.current;
  try { const value = await api.promptCommands(projectId, { type: "preview", scope: command.scope, name: command.name, arguments: args }); if (token === operation.current && "text" in value) { setPreview(value); setArguments(args); setPreviewArguments(args); } }
  catch (reason) { if (token === operation.current) setError(errorMessage(reason)); }
  finally { if (token === operation.current) { pending.current = false; setBusy(false); } }
 }
 function edit(command?: PromptCommandPreview) { setEditing(true); setError(""); setName(command?.name ?? ""); setDescription(command?.description ?? ""); setTemplate(command?.template ?? ""); setScope(command?.scope ?? (projectId ? "project" : "global")); setHash(command?.hash ?? "new"); }
 async function save() {
  if (!api || pending.current) return; pending.current = true; setBusy(true); setError(""); const token = ++operation.current;
  try { const value = await api.promptCommands(projectId, { type: "save", scope, name, description, template, expectedHash: hash }); if (token === operation.current && "text" in value) { setEditing(false); setPreview(value); setArguments(""); setPreviewArguments(""); setAttempt(value => value + 1); } }
  catch (reason) { if (token === operation.current) setError(errorMessage(reason)); }
  finally { if (token === operation.current) { pending.current = false; setBusy(false); } }
 }
 return <dialog className="prompt-command-dialog" ref={dialog} aria-label="Chat commands" onCancel={event => { event.preventDefault(); onClose(); }}>
  <div className="prompt-command-heading"><h2>{editing ? hash === "new" ? "New command" : "Edit command" : preview ? `/${preview.name}` : "Commands"}</h2><button type="button" aria-label="Close chat commands" onClick={onClose}><X size={16} /></button></div>
  {native && !editing && !preview && <div className="prompt-command-actions"><button type="button" aria-pressed={!nativeTab} className={!nativeTab ? "task-primary" : undefined} onClick={() => setNativeTab(false)}>Saved prompts</button><button type="button" aria-pressed={nativeTab} className={nativeTab ? "task-primary" : undefined} onClick={() => setNativeTab(true)}>{native === "pi" ? "Pi" : native === "claude" ? "Claude" : native === "codex" ? "OpenAI" : "OpenCode"}</button></div>}
  {error && <p className="task-error" role="alert">{error}</p>}
  {nativeTab ? <NativeActionPicker taskId={taskId} onInsert={(text, action) => { onInsert(text, action); onClose(); }} /> : editing ? <form className="prompt-command-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
   <label>Name<input aria-label="Command name" maxLength={64} required readOnly={hash !== "new"} value={name} onChange={event => setName(event.target.value)} placeholder="review" /></label>
   <label>Scope<select aria-label="Command scope" disabled={hash !== "new" || busy} value={scope} onChange={event => setScope(event.target.value as PromptCommand["scope"])}><option value="global">All chats</option>{projectId && <option value="project">This project</option>}</select></label>
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
   <div className="prompt-command-search"><Search size={16} /><input aria-label="Search chat commands" role="combobox" aria-expanded="true" aria-controls="chat-command-results" aria-activedescendant={commands.length ? `chat-command-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex(value => Math.max(0, Math.min(commands.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter" && commands[selected]) { event.preventDefault(); void load(commands[selected]); } }} placeholder="Search commands" /><button type="button" disabled={busy || loading} onClick={() => edit()}><Plus size={14} />New</button></div>
   {loading ? <p role="status">Loading commands…</p> : <div className="prompt-command-results" id="chat-command-results" role="listbox" aria-label="Chat commands">{commands.map((command, position) => <button type="button" role="option" aria-selected={position === selected} id={`chat-command-${position}`} key={`${command.scope}/${command.name}`} disabled={busy} onMouseEnter={() => setIndex(position)} onClick={() => void load(command)}><span><strong>/{command.name}</strong>{command.description && <small>{command.description}</small>}</span><small>{command.scope === "project" ? "Project" : "All chats"}</small></button>)}{!commands.length && <p className="task-muted">{query ? "No matching commands." : "Save a prompt you use often as a command."}</p>}</div>}
   <button type="button" disabled={loading || busy} onClick={() => setAttempt(value => value + 1)}>Refresh commands</button>
   {catalog.errors.length > 0 && <details className="prompt-command-errors"><summary>Unavailable commands ({catalog.errors.length})</summary>{catalog.errors.map(error => <p key={error}>{error}</p>)}</details>}
  </>}
 </dialog>;
}
function errorMessage(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
