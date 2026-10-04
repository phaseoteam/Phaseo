import { useEffect, useId, useRef, useState } from "react";
import type { McpPromptEntry, McpPromptPreview } from "../../shared/mcpPrompts";

export function McpPromptPicker({ taskId, onInsert }: { taskId: string; onInsert: (text: string) => void }) {
 const api = window.phaseoDesktop?.workspace, search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), firstArgument = useRef<HTMLInputElement>(null), loadButton = useRef<HTMLButtonElement>(null), listId = useId();
 const pending = useRef(false), operation = useRef(0), requestId = useRef<string | undefined>(undefined);
 const [entries, setEntries] = useState<McpPromptEntry[]>([]), [query, setQuery] = useState(""), [index, setIndex] = useState(0), [attempt, setAttempt] = useState(0);
 const [selected, setSelected] = useState<McpPromptEntry>(), [args, setArgs] = useState<Record<string, string>>({}), [preview, setPreview] = useState<McpPromptPreview>(), [previewArgs, setPreviewArgs] = useState("");
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
 useEffect(() => {
  if (!api) { setLoading(false); setError("Open the desktop app to load MCP prompts."); return; }
  let active = true; const token = ++operation.current, id = crypto.randomUUID(); requestId.current = id; pending.current = true; setLoading(true); setError("");
  void api.mcpPrompts(taskId, { type: "list", requestId: id }).then(value => { if (active && "prompts" in value) setEntries(value.prompts); }, reason => { if (active) setError(message(reason)); }).finally(() => { if (active && token === operation.current) { requestId.current = undefined; pending.current = false; setLoading(false); } });
  return () => { active = false; operation.current++; const id = requestId.current; requestId.current = undefined; if (id) void api.mcpPrompts(taskId, { type: "cancel", requestId: id }).catch(() => {}); };
 }, [api, taskId, attempt]);
 useEffect(() => { if (selected) (firstArgument.current ?? loadButton.current)?.focus(); else search.current?.focus(); }, [selected]);
 const matches = entries.filter(entry => `${entry.server} ${entry.name} ${entry.description}`.toLowerCase().includes(query.toLowerCase())), activeIndex = Math.max(0, Math.min(index, matches.length - 1));
 useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [activeIndex, query, entries]);
 const supplied = selected ? Object.fromEntries(selected.arguments.filter(arg => arg.required || args[arg.name] !== "").map(arg => [arg.name, args[arg.name] ?? ""])) : {};
 const currentArgs = JSON.stringify(supplied);
 const choose = (entry: McpPromptEntry) => { setSelected(entry); setArgs(Object.fromEntries(entry.arguments.map(arg => [arg.name, ""]))); setPreview(undefined); setError(""); };
 async function load() {
  if (!api || !selected || pending.current) return;
  pending.current = true; setBusy(true); setError(""); const token = ++operation.current, id = crypto.randomUUID(); requestId.current = id;
  try { const value = await api.mcpPrompts(taskId, { type: "preview", requestId: id, connectionId: selected.connectionId, name: selected.name, arguments: supplied }); if (token === operation.current && "messages" in value) { setPreview(value); setPreviewArgs(currentArgs); } }
  catch (reason) { if (token === operation.current) setError(message(reason)); }
  finally { if (token === operation.current) { requestId.current = undefined; pending.current = false; setBusy(false); } }
 }
 return <div className="prompt-command-preview mcp-prompt-picker">
  {error && <p className="task-error" role="alert">{error}</p>}
  {selected ? <><strong>{selected.name}</strong><small>{selected.server}</small>{selected.description && <p>{selected.description}</p>}
   <form onSubmit={event => { event.preventDefault(); void load(); }}>
    <fieldset disabled={busy}>{selected.arguments.map((arg, index) => <label key={arg.name}>{arg.name}{arg.required ? " *" : ""}<input ref={index === 0 ? firstArgument : undefined} aria-label={`Prompt argument: ${arg.name}`} aria-required={arg.required} value={args[arg.name] ?? ""} maxLength={16384} onChange={event => setArgs(current => ({ ...current, [arg.name]: event.target.value }))} />{arg.description && <small>{arg.description}</small>}</label>)}</fieldset>
    <div className="prompt-command-actions"><button type="button" disabled={busy} onClick={() => { setSelected(undefined); setPreview(undefined); setError(""); }}>Back</button><button ref={loadButton} type="submit" className={preview ? undefined : "task-primary"} disabled={busy}>{busy ? "Loading…" : preview ? "Reload prompt" : "Load prompt"}</button></div>
   </form>
   {preview && <><label>Preview<textarea aria-label="MCP prompt preview" rows={6} readOnly value={preview.text ?? JSON.stringify(preview.messages, null, 2)} /></label>{preview.insertionError && <p className="task-muted">{preview.insertionError}</p>}<div className="prompt-command-actions"><button type="button" className="task-primary" disabled={busy || preview.text === undefined || currentArgs !== previewArgs} onClick={() => { try { if (preview.text !== undefined) onInsert(preview.text); } catch (reason) { setError(message(reason)); } }}>Insert into chat</button></div></>}
  </> : <><input ref={search} role="combobox" aria-autocomplete="list" aria-expanded={!loading && !error && matches.length > 0} aria-controls={listId} aria-activedescendant={!loading && !error && matches.length ? `${listId}-${activeIndex}` : undefined} aria-label="Search MCP prompts" placeholder="Search MCP prompts" value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => { if (event.nativeEvent.isComposing || loading || error || !matches.length) return; if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setIndex(event.key === "Home" ? 0 : matches.length - 1); } else if (event.key === "Enter") { event.preventDefault(); choose(matches[activeIndex]); } }} />
   {loading ? <p role="status">Loading MCP prompts…</p> : <div ref={list} id={listId} role="listbox" aria-label="MCP prompts" className="prompt-command-results">{!error && matches.map((entry, index) => <button type="button" role="option" aria-selected={index === activeIndex} id={`${listId}-${index}`} key={`${entry.connectionId}/${entry.name}`} onFocus={() => setIndex(index)} onClick={() => choose(entry)}><span><strong>{entry.name}</strong>{entry.description && <small>{entry.description}</small>}</span><small>{entry.server}</small></button>)}{!error && !matches.length && <p className="task-muted" role="status">{entries.length ? "No matching prompts." : "No prompts from enabled MCP services."}</p>}</div>}
   <button type="button" disabled={loading || busy} onClick={() => setAttempt(value => value + 1)}>Refresh</button>
  </>}
 </div>;
}
function message(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
