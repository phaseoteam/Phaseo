import { useEffect, useState } from "react";
import type { HarnessInstallation, Workspace } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";

export function Agents() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	const [installed, setInstalled] = useState<HarnessInstallation[]>([]);
	const [name, setName] = useState(""); const [executable, setExecutable] = useState(""); const [argumentsText, setArgumentsText] = useState("[]");
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.get().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		void api.installations().then(value => { if (active) setInstalled(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace); return () => { active = false; unsubscribe(); };
	}, [api]);
	async function add() {
		if (!api) return; setBusy(true); setError("");
		try { const argumentsValue: unknown = JSON.parse(argumentsText); if (!Array.isArray(argumentsValue) || argumentsValue.some(value => typeof value !== "string")) throw new Error('Use a JSON array of arguments, such as ["--acp"].'); setWorkspace(await api.command({ type: "add-agent", name, executable, arguments: argumentsValue as string[] })); setName(""); setExecutable(""); setArgumentsText("[]"); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
	}
	return <div className="page accounts-page"><h1>Agents</h1>{error && <p className="task-error" role="alert">{error}</p>}<section className="panel"><div className="panel-heading"><h2>Native harnesses</h2></div>{installed.map(value => <div className="account-row" key={value.harness}><div><strong>{value.harness}</strong><small>{value.installed ? "Installed" : value.error ?? "Install the native CLI to use this harness."}</small></div></div>)}</section><section className="panel"><div className="panel-heading"><h2>ACP agents</h2></div>{workspace.agents.map(agent => <div className="account-row" key={agent.id}><div><strong>{agent.name}</strong><small>{agent.executable} {agent.arguments.join(" ")}</small></div></div>)}{!workspace.agents.length && <p className="task-muted">Connect an installed agent that supports the Agent Client Protocol.</p>}<form className="account-form" onSubmit={event => { event.preventDefault(); void add(); }}><label>Name<input value={name} onChange={event => setName(event.target.value)} required /></label><label>Executable<input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Path to an agent executable" required /></label><label>Arguments<input value={argumentsText} onChange={event => setArgumentsText(event.target.value)} required /></label><button className="task-primary" type="submit" disabled={busy || !api}>Connect agent</button></form></section></div>;
}
