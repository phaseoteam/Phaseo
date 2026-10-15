/** Asks the pane to open a project file in a file surface (the diff's file names and the file explorer send it). */
export const OPEN_PROJECT_FILE_EVENT = "phaseo:open-project-file";
export type OpenProjectFileDetail = { projectId: string; path: string };
/** A surface changed the project's files or Git state (a save, stage, commit, push), so others refresh. */
export const PROJECT_CHANGED_EVENT = "phaseo:project-changed";
export type ProjectChangedDetail = { projectId: string };

export const openProjectFile = (detail: OpenProjectFileDetail) => window.dispatchEvent(new CustomEvent<OpenProjectFileDetail>(OPEN_PROJECT_FILE_EVENT, { detail }));
export const announceProjectChange = (projectId: string) => window.dispatchEvent(new CustomEvent<ProjectChangedDetail>(PROJECT_CHANGED_EVENT, { detail: { projectId } }));
export function onProjectChange(projectId: string, listener: () => void) {
	const handle = (event: Event) => { if ((event as CustomEvent<ProjectChangedDetail>).detail?.projectId === projectId) listener(); };
	window.addEventListener(PROJECT_CHANGED_EVENT, handle);
	return () => window.removeEventListener(PROJECT_CHANGED_EVENT, handle);
}
