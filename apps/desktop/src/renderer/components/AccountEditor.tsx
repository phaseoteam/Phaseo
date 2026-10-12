import { useState } from "react";
import type { Account, WorkspaceCommand } from "../../shared/workspace";

export function AccountEditor({ account, onSave, onCancel }: { account: Account; onSave: (command: Extract<WorkspaceCommand, { type: "update-account" }>) => Promise<boolean>; onCancel: () => void }) {
	const [name, setName] = useState(account.name); const [endpoint, setEndpoint] = useState(account.endpoint ?? ""); const [key, setKey] = useState(""); const [saving, setSaving] = useState(false);
	return <form className="account-form" aria-label="Edit account" onSubmit={event => { event.preventDefault(); setSaving(true); void onSave({ type: "update-account", id: account.id, name, ...(account.kind === "api" && account.harness !== "cursor" && endpoint !== account.endpoint ? { endpoint } : {}), ...(key ? { apiKey: key } : {}) }).then(saved => { if (saved) onCancel(); }).finally(() => setSaving(false)); }}>
		<label>Account name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required /></label>
		{account.kind === "api" && <>{account.harness !== "cursor" && <label>API endpoint<input value={endpoint} onChange={event => setEndpoint(event.target.value)} required /></label>}<label>New API key<input type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" maxLength={10000} placeholder="Leave blank to keep the current key" /></label></>}
		<div className="account-form-actions"><button type="submit" className="task-primary" disabled={saving || !name.trim() || (account.kind === "api" && account.harness !== "cursor" && !endpoint.trim())}>Save account</button><button type="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
	</form>;
}
