import { useEffect, useState } from "react";
import type { Task } from "../../shared/workspace";
import { providerLabels, statusSourcesFor, type ProviderIncident } from "../../shared/providerStatus";
import { Callout } from "../components/ui/callout";

/** Incidents, shared by every chat; read again every five minutes while a chat that depends on them is open. */
let latest: { at: number; incidents: ProviderIncident[] } | undefined;
function useIncidents(enabled: boolean) {
	const [incidents, setIncidents] = useState(latest?.incidents ?? []);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!enabled || !api?.providerIncidents) return;
		let active = true;
		const read = () => void api.providerIncidents().then(value => { latest = { at: Date.now(), incidents: value }; if (active) setIncidents(value); }, () => undefined);
		read();
		const timer = setInterval(read, 5 * 60_000);
		return () => { active = false; clearInterval(timer); };
	}, [enabled]);
	return incidents;
}

/**
 * When the service a chat's agent depends on has an open incident on its public status page: what it is, so a slow or
 * failing turn is not a mystery, with a link to the page.
 */
export function ProviderStatusNotice({ task }: { task: Task }) {
	const sources = statusSourcesFor(task.harness);
	const incidents = useIncidents(sources.length > 0 && !task.archived).filter(incident => sources.includes(incident.id));
	if (!incidents.length) return null;
	const worst = incidents.some(incident => incident.severity !== "minor");
	return <Callout tone={worst ? "critical" : "warning"} role="status" title={`${providerLabels[incidents[0].id]} reports ${incidents.length === 1 ? "an incident" : `${incidents.length} incidents`}`}>
		<ul className="flex flex-col gap-0.5">{incidents.map(incident => <li key={`${incident.id}:${incident.title}`}>{incident.title}</li>)}</ul>
		<button type="button" onClick={() => void window.phaseoDesktop?.workspace.openStatusPage(incidents[0].id)} className="mt-1 font-medium underline-offset-2 hover:underline">Open the status page</button>
	</Callout>;
}
