import { activitySummary } from "./activitySummary";
import type { AgentActivity, Task } from "./workspace";

/** Tool and reasoning text longer than this stays in the main process until its row is opened. */
export const activityPreviewFrom = 2_000;
/** Edits keep their text: the row's file names and "Open diff" are read from it. */
export const editTools = /^(?:edit_file|write_file|delete_file|Edit|MultiEdit|Write|NotebookEdit|apply_patch|fileChange)$/;

/**
 * An activity as the window first gets it: long tool output becomes its one-line summary, and long reasoning is left
 * out (a collapsed row shows neither), with `textLength` saying the rest loads when the row opens. Running activities,
 * edits, plans, usage reports and short text are kept whole.
 */
export function previewActivity(activity: AgentActivity): AgentActivity {
	if ((activity.type !== "tool" && activity.type !== "reasoning") || activity.status === "running" || activity.text.length <= activityPreviewFrom || activity.htmlRender || activity.proposed) return activity;
	if (activity.type === "tool" && editTools.test(activity.title)) return activity;
	return { ...activity, text: activity.type === "reasoning" ? "" : activitySummary(activity.text).slice(0, 300), textLength: activity.text.length };
}

/** A turn's owner: the user message an activity id starts with (`<message id>:<step>`). */
const owner = (activity: AgentActivity) => activity.id.slice(0, Math.max(0, activity.id.indexOf(":")));

/**
 * Previews for every turn but the chat's latest, which may still be running and is read as it streams. `latestUserId`
 * is the chat's last user message.
 */
export function previewActivities(activities: AgentActivity[] | undefined, latestUserId: string | undefined): AgentActivity[] | undefined {
	if (!activities?.length) return activities;
	let changed = false;
	const result = activities.map(activity => { if (latestUserId && owner(activity) === latestUserId) return activity; const value = previewActivity(activity); if (value !== activity) changed = true; return value; });
	return changed ? result : activities;
}

/** A chat view for the window, with previews (see previewActivities). */
export function previewTask(task: Task, latestUserId: string | undefined): Task {
	const activities = previewActivities(task.activities, latestUserId);
	return activities === task.activities ? task : { ...task, activities };
}
