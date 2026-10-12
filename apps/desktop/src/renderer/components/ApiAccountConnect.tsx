import { useState } from "react";

export function ApiAccountConnect({ connect, disabled }: { connect: (value: { name: string; endpoint: string; apiKey: string }) => Promise<boolean>; disabled: boolean }) {
	const [name, setName] = useState("Phaseo");
	const [endpoint, setEndpoint] = useState("https://api.phaseo.app/v1");
	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);
	return <form className="account-form" aria-label="Connect Phaseo account" onSubmit={event => {
		event.preventDefault(); if (saving || disabled) return; setSaving(true);
		void connect({ name, endpoint, apiKey }).then(success => { if (success) setApiKey(""); }).finally(() => setSaving(false));
	}}>
		<label>Name<input value={name} onChange={event => setName(event.target.value)} required disabled={saving || disabled} /></label>
		<label>API endpoint<input value={endpoint} onChange={event => setEndpoint(event.target.value)} required disabled={saving || disabled} /></label>
		<label>API key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" required disabled={saving || disabled} /></label>
		<button className="task-primary" disabled={saving || disabled || !name.trim() || !apiKey.trim()}>{saving ? "Connecting…" : "Connect account"}</button>
	</form>;
}
