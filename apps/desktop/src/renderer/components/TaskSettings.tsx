import { useEffect, useState } from "react";
import type { ModelOption, Task } from "../../shared/workspace";

export function TaskSettings({ task, save, close }: { task: Task; save: (model: string, mode: Task["mode"], reasoningEffort: string, nativeMode: string) => Promise<boolean>; close: () => void }) {
	const [model, setModel] = useState(task.model); const [mode, setMode] = useState(task.mode);
	const [reasoningEffort, setReasoningEffort] = useState(task.reasoningEffort ?? "");
	const [nativeMode, setNativeMode] = useState(task.nativeMode ?? "");
	const [models, setModels] = useState<ModelOption[]>(task.nativeModels ?? []); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !["codex", "phaseo", "opencode", "pi", "cursor"].includes(task.harness)) return;
		let active = true; setLoading(true);
		void api.models(task.harness, task.accountId, task.projectId).then(value => { if (active) setModels(value); }, reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [task.harness, task.accountId, task.projectId]);
	const selectedModel = models.find(value => model === "default" ? value.default : value.id === model);
	return <form className="task-setup" aria-label="Task settings" onSubmit={event => { event.preventDefault(); setSaving(true); void save(model.trim(), mode, reasoningEffort, nativeMode).then(success => { if (success) close(); }).finally(() => setSaving(false)); }}>
		<label>Model<input aria-label="Task model" list="task-settings-models" value={model} onChange={event => { setModel(event.target.value); setReasoningEffort(""); }} required maxLength={1000} disabled={saving} /><datalist id="task-settings-models">{models.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</datalist>{loading && <small>Loading models…</small>}{error && <small>{error}</small>}</label>
		{(task.harness === "codex" || (task.harness === "acp" && (selectedModel?.reasoningEfforts?.length || reasoningEffort))) && <label>Reasoning effort<select aria-label="Reasoning effort" value={reasoningEffort} disabled={saving || loading} onChange={event => setReasoningEffort(event.target.value)}><option value="">Default{selectedModel?.defaultReasoningEffort ? ` (${selectedModel.defaultReasoningEffort})` : ""}</option>{reasoningEffort && !selectedModel?.reasoningEfforts?.some(value => value.id === reasoningEffort) && <option value={reasoningEffort}>{reasoningEffort} (availability unverified)</option>}{selectedModel?.reasoningEfforts?.map(value => <option key={value.id} value={value.id} title={value.description}>{value.id}</option>)}</select></label>}
		<label>Mode<select aria-label="Task mode" value={mode} onChange={event => setMode(event.target.value as Task["mode"])} disabled={saving}><option value="chat">Chat</option><option value="code">Code</option><option value="plan">Plan</option></select></label>
		{task.harness === "acp" && <label>Agent mode<select aria-label="Agent mode" value={nativeMode} disabled={saving} onChange={event => setNativeMode(event.target.value)}><option value="">Automatic</option>{nativeMode && !task.nativeModes?.some(value => value.id === nativeMode) && <option value={nativeMode}>{nativeMode} (availability unverified)</option>}{task.nativeModes?.map(value => <option key={value.id} value={value.id} title={value.description}>{value.name}</option>)}</select></label>}
		<button type="submit" disabled={saving || !model.trim() || (task.harness === "phaseo" && model.trim() === "default")}>Save settings</button><button type="button" disabled={saving} onClick={close}>Cancel</button>
	</form>;
}
