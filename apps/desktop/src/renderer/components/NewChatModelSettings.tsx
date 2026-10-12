import { useEffect, useState } from "react";
import type { Account } from "../../shared/workspace";
import { useModels } from "../lib/useModels";
import { setDefaultModel, useModelPreferences, type ModelSelection } from "../lib/modelPreferences";
import { SessionPicker } from "./SessionPicker";
import { Select } from "./Select";
import { ModelDiscoveryFeedback } from "./ModelDiscoveryFeedback";

export function NewChatModelSettings() {
	const preferences = useModelPreferences();
	const [fixed, setFixed] = useState(!!preferences.defaultSelection);
	const [selection, setSelection] = useState<ModelSelection>(preferences.defaultSelection ?? preferences.recentSelection ?? { harness: "codex", model: "" });
	const [accounts, setAccounts] = useState<Account[]>([]);
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setAccounts(value.accounts); }, () => {});
		const unsubscribe = api.onOverviewChange(value => setAccounts(value.accounts));
		return () => { active = false; unsubscribe(); };
	}, [api]);
	const { models, loading, error } = useModels(selection.harness, selection.accountId, undefined, undefined, fixed);
	const selected = models.find(model => model.id === selection.model);
	const saved = JSON.stringify(preferences.defaultSelection) === JSON.stringify(selection);
	return <section className="panel" aria-label="New chat model"><div className="panel-heading"><h2>New chats</h2></div><div className="settings-fields">
		<label className="setting-row"><span><strong>Model selection</strong></span><Select label="New chat model selection" value={fixed ? "fixed" : "recent"} options={[{ value: "recent", label: "Last used model" }, { value: "fixed", label: "Specific model" }]} onValueChange={value => { setFixed(value === "fixed"); if (value === "recent") setDefaultModel(); }} /></label>
		{fixed && <div className="setting-row"><span><strong>Default model</strong></span><SessionPicker harness={selection.harness} model={selection.model} models={models} loading={loading} reasoningEffort={selection.reasoningEffort ?? ""} serviceTier={selection.serviceTier ?? ""} onHarnessChange={harness => setSelection({ harness, model: "" })} onModelChange={model => { const option = models.find(value => value.id === model); setSelection({ ...selection, model, reasoningEffort: option?.defaultReasoningEffort, serviceTier: option?.defaultServiceTier }); }} onReasoningChange={reasoningEffort => setSelection({ ...selection, reasoningEffort })} onSpeedChange={serviceTier => setSelection({ ...selection, serviceTier })} connection={selection.harness !== "pi" && <Select label="Default model account" value={selection.accountId ?? ""} options={[{ value: "", label: ["phaseo", "cursor"].includes(selection.harness) ? "Choose an account" : "Existing local login" }, ...accounts.filter(account => account.harness === selection.harness && account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > Date.now())).map(account => ({ value: account.id, label: account.name }))]} onValueChange={accountId => setSelection({ harness: selection.harness, accountId: accountId || undefined, model: "" })} />} feedback={<ModelDiscoveryFeedback loading={loading} error={error} />} /></div>}
		{fixed && <div className="prompt-command-actions"><button type="button" className="task-primary" disabled={!selected || loading || saved} onClick={() => setDefaultModel(selection)}>{saved ? "Saved" : "Use as default"}</button></div>}
	</div></section>;
}
