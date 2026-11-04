import { useEffect, useState } from "react";
import type { Mission } from "../../shared/missions";
import { errorText } from "../app/workspace";

/**
 * Scheduled tasks, kept current across the app. Storage still calls them missions. Apart from their page, so the sidebar
 * can count them without loading the page's editor.
 */
export function useScheduledTasks() {
	const api = window.phaseoDesktop?.workspace;
	const [tasks, setTasks] = useState<Mission[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.missions().then(values => { if (active) setTasks(values); }, reason => { if (active) setError(errorText(reason)); });
		const unsubscribe = api.onMissionsChange(setTasks);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	return { tasks, setTasks, error, setError };
}
