import { useEffect, useState } from "react";

const repositories = new Map<string, Promise<string | null>>();
/** The project's GitHub repository (owner/repo), read once per project from its origin remote; null when it has none. */
export function projectRepository(projectId: string): Promise<string | null> {
	const api = window.phaseoDesktop?.workspace;
	if (!api || !projectId) return Promise.resolve(null);
	let read = repositories.get(projectId);
	if (!read) { read = api.projectRepository(projectId).catch(() => null); repositories.set(projectId, read); }
	return read;
}
export function useProjectRepository(projectId: string | undefined) {
	const [repository, setRepository] = useState<{ projectId: string; value: string | null }>();
	useEffect(() => {
		if (!projectId) return;
		let active = true;
		void projectRepository(projectId).then(value => { if (active) setRepository({ projectId, value }); });
		return () => { active = false; };
	}, [projectId]);
	return repository && repository.projectId === projectId ? repository.value : undefined;
}
