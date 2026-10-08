import { useEffect, useRef, useState } from "react";
import { defaultPreferences } from "../../shared/preferences";
import type { WorkspacePreferences } from "../../shared/preferences";
import { GlobalInstructionsEditor } from "../components/GlobalInstructionsEditor";

export function WorkspaceSettings() {
	const [preferences, setPreferences] = useState(defaultPreferences);
	const [supported, setSupported] = useState<boolean>();
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(""); const [attempt, setAttempt] = useState(0);
	const [saveError, setSaveError] = useState<{ message: string; value: WorkspacePreferences }>();
	const loadPending = useRef(true); const savePending = useRef(false);
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) { loadPending.current = false; setLoading(false); setLoadError("Open the desktop application to load settings."); return; }
		let active = true; loadPending.current = true; setLoading(true); setLoadError("");
		void api.preferences().then(value => { if (active) { setPreferences(value.preferences); setSupported(value.notificationsSupported); } }, reason => { if (active) setLoadError(errorMessage(reason)); }).finally(() => { if (active) { loadPending.current = false; setLoading(false); } });
		return () => { active = false; };
	}, [api, attempt]);
	function retryLoad() { if (!api || loadPending.current) return; loadPending.current = true; setLoading(true); setAttempt(value => value + 1); }
	async function save(value: WorkspacePreferences) {
		if (!api || savePending.current || loadPending.current || supported === undefined) return;
		savePending.current = true; setBusy(true); setSaveError(undefined);
		try { setPreferences(await api.savePreferences(value)); }
		catch (reason) { setSaveError({ message: errorMessage(reason), value }); }
		finally { savePending.current = false; setBusy(false); }
	}
	return <div className="page settings-page"><section className="page-heading"><div><h1>Settings</h1></div></section>
		<section className="panel" aria-label="Notifications" aria-busy={loading || busy}>
			<div className="panel-heading"><h2>Notifications</h2>{loadError && <button type="button" disabled={loading || !api} onClick={retryLoad}>Retry</button>}</div>
			<div className="settings-fields">
				<label className="setting-row"><span><strong>Desktop alerts</strong><small>Receive updates while Phaseo is in the background.</small></span><select aria-label="Desktop alerts" disabled={loading || busy || supported === undefined} value={preferences.notifications} onChange={event => void save({ ...preferences, notifications: event.target.value as WorkspacePreferences["notifications"] })}><option value="off">Off</option><option value="attention">Needs attention</option><option value="all">All task updates</option></select></label>
				<label className="setting-row"><span><strong>Show task titles</strong><small>Conversation content stays private.</small></span><input type="checkbox" checked={preferences.notificationTitles} disabled={loading || busy || supported === undefined} onChange={event => void save({ ...preferences, notificationTitles: event.target.checked })} /></label>
				{supported === false && <p role="status">Desktop notifications are unavailable on this system. Updates remain in Inbox.</p>}
			</div>
			{(loading || busy) && <div className="settings-feedback"><p role="status">{loading ? "Loading settings…" : "Saving…"}</p></div>}
			{loadError && !loading && <div className="settings-feedback"><p className="task-error" role="alert">{loadError}</p></div>}
			{saveError && <div className="settings-feedback"><p className="task-error" role="alert">{saveError.message}</p><button type="button" onClick={() => void save(saveError.value)}>Retry</button></div>}
		</section>
		<GlobalInstructionsEditor />
	</div>;
}

function errorMessage(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
