import { useEffect, useRef, useState } from "react";
import type { InstructionDocument } from "../../shared/instructions";

export function GlobalInstructionsEditor() {
 const api = window.phaseoDesktop?.workspace;
 const [document, setDocument] = useState<InstructionDocument>(); const [content, setContent] = useState("");
 const [busy, setBusy] = useState(true), [error, setError] = useState(""), [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0);
 const pending = useRef(false), mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 useEffect(() => {
  let active = true; setBusy(true); setError(""); setSaved(false); pending.current = true;
  if (!api) { setBusy(false); setError("Open the desktop app to edit instructions."); pending.current = false; return; }
  void api.globalInstructions().then(value => { if (active) { setDocument(value); setContent(value.content); } }, reason => { if (active) setError(message(reason)); }).finally(() => { if (active) { setBusy(false); pending.current = false; } });
  return () => { active = false; };
 }, [api, attempt]);
 async function save() {
  if (!api || !document || pending.current) return;
  pending.current = true; setBusy(true); setError(""); setSaved(false);
  try { const value = await api.saveGlobalInstructions({ content, expectedHash: document.hash }); if (mounted.current) { setDocument(value); setContent(value.content); setSaved(true); } }
  catch (reason) { if (mounted.current) setError(message(reason)); }
  finally { pending.current = false; if (mounted.current) setBusy(false); }
 }
 return <section className="panel" aria-label="Global instructions" aria-busy={busy}>
  <div className="panel-heading"><h2>Global instructions</h2></div>
  <div className="settings-fields"><p className="task-muted">Apply to Phaseo Chat, Code and Plan. Project instructions take precedence.</p>
   <label className="global-instructions-field">Instructions<textarea aria-label="Global instructions text" value={content} disabled={busy || !document} onChange={event => { setContent(event.target.value); setSaved(false); }} rows={8} /></label>
   <div className="prompt-command-actions"><button type="button" disabled={busy || !api} onClick={() => { if (!pending.current) setAttempt(value => value + 1); }}>Reload</button><button type="button" className="task-primary" disabled={busy || !document || content === document.content} onClick={() => void save()}>Save instructions</button></div>
   {busy && <p role="status">Loading or saving instructions…</p>}{saved && <p role="status">Instructions saved.</p>}{error && <p role="alert" className="task-error">{error}</p>}
  </div>
 </section>;
}
function message(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
