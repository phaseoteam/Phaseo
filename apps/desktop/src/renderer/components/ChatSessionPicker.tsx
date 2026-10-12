import { useRef, useState } from "react";
import type { Harness, Task } from "../../shared/workspace";
import { useModels } from "../lib/useModels";
import { SessionPicker } from "./SessionPicker";
import { ModelDiscoveryFeedback } from "./ModelDiscoveryFeedback";
import { rememberModel } from "../lib/modelPreferences";

export function ChatSessionPicker({ task, save, onHarnessChange }: { task: Task; save: (model: string, reasoningEffort: string, serviceTier: string) => Promise<boolean>; onHarnessChange: (harness: Harness) => void }) {
	const { models, loading, error } = useModels(task.harness, task.accountId, task.projectId, task.nativeModels);
	const [saving, setSaving] = useState(false);
	const pending = useRef(false);
	async function update(model: string, effort: string, speed: string) {
		if (pending.current) return;
		pending.current = true; setSaving(true);
		try { if (await save(model, effort, speed)) rememberModel({ harness: task.harness, accountId: task.accountId, model, reasoningEffort: effort, serviceTier: speed }); } finally { pending.current = false; setSaving(false); }
	}
	return <SessionPicker harness={task.harness} model={task.model} models={models} loading={loading} disabled={saving || task.archived || task.status === "running" || task.status === "waiting"} reasoningEffort={task.reasoningEffort ?? ""} serviceTier={task.serviceTier ?? ""} onHarnessChange={onHarnessChange} onModelChange={value => { const selected = models.find(item => item.id === value); void update(value, selected?.defaultReasoningEffort ?? "", selected?.defaultServiceTier ?? ""); }} onReasoningChange={value => void update(task.model, value, task.serviceTier ?? "")} onSpeedChange={value => void update(task.model, task.reasoningEffort ?? "", value)} feedback={<ModelDiscoveryFeedback loading={loading} error={error} />} switchingSession />;
}
