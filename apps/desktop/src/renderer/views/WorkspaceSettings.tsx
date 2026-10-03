import { useEffect, useState } from "react";
import { defaultPreferences } from "../../shared/preferences";
import type { WorkspacePreferences } from "../../shared/preferences";

export function WorkspaceSettings() {
	const [preferences, setPreferences] = useState(defaultPreferences);
	const [supported, setSupported] = useState<boolean>();
	const [busy, setBusy] = useState(false); const [error, setError] = useState("");
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => { if (!api) return; let active = true; void api.preferences().then(value => { if (active) { setPreferences(value.preferences); setSupported(value.notificationsSupported); } }, reason => { if (active) setError(String(reason)); }); return () => { active = false; }; }, [api]);
	async function save(value: WorkspacePreferences) { if (!api) return; setBusy(true); setError(""); try { setPreferences(await api.savePreferences(value)); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } }
	return <div className="page settings-page"><section className="page-heading"><div><h1>Settings</h1></div></section>
		{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel" aria-label="Notifications">
			<div className="panel-heading"><h2>Notifications</h2></div>
			<div className="settings-fields">
				<label className="setting-row"><span><strong>Desktop alerts</strong><small>Receive updates while Phaseo is in the background.</small></span><select aria-label="Desktop alerts" disabled={busy || supported === undefined} value={preferences.notifications} onChange={event => void save({ ...preferences, notifications: event.target.value as WorkspacePreferences["notifications"] })}><option value="off">Off</option><option value="attention">Needs attention</option><option value="all">All task updates</option></select></label>
				<label className="setting-row"><span><strong>Show task titles</strong><small>Conversation content stays private.</small></span><input type="checkbox" checked={preferences.notificationTitles} disabled={busy || supported === undefined} onChange={event => void save({ ...preferences, notificationTitles: event.target.checked })} /></label>
				{supported === false && <p role="status">Desktop notifications are unavailable on this system. Updates remain in Inbox.</p>}
			</div>
		</section>
	</div>;
}
