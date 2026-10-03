import { useEffect, useState } from "react";
import type { ModelOption, Task } from "../../shared/workspace";

export function TaskSettings({ task, save, close }: { task: Task; save: (model: string, mode: Task["mode"]) => Promise<boolean>; close: () => void }) {
	const [model, setModel] = useState(task.model); const [mode, setMode] = useState(task.mode);
	const [models, setModels] = useState<ModelOption[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !["codex", "phaseo", "opencode", "pi"].includes(task.harness)) return;
		let active = true; setLoading(true);
		void api.models(task.harness, task.accountId, task.projectId).then(value => { if (active) setModels(value); }, reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [task.harness, task.accountId, task.projectId]);
	return <form className="task-setup" aria-label="Task settings" onSubmit={event => { event.preventDefault(); setSaving(true); void save(model.trim(), mode).then(success => { if (success) close(); }).finally(() => setSaving(false)); }}>
		<label>Model<input aria-label="Task model" list="task-settings-models" value={model} onChange={event => setModel(event.target.value)} required maxLength={1000} disabled={saving} /><datalist id="task-settings-models">{models.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</datalist>{loading && <small>Loading models…</small>}{error && <small>{error}</small>}</label>
		<label>Mode<select aria-label="Task mode" value={mode} onChange={event => setMode(event.target.value as Task["mode"])} disabled={saving}><option value="chat">Chat</option><option value="code">Code</option><option value="plan">Plan</option></select></label>
		<button type="submit" disabled={saving || !model.trim() || (task.harness === "phaseo" && model.trim() === "default")}>Save settings</button><button type="button" disabled={saving} onClick={close}>Cancel</button>
	</form>;
}
