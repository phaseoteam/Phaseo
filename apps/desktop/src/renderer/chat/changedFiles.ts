import type { TurnFileChange } from "../../shared/gitDiff";

/** One line for a turn's changes: file names (the first two, then a count) and lines added and removed. */
export function changesSummary(changes: readonly TurnFileChange[]) {
	const names = changes.map(change => change.path.split("/").at(-1) ?? change.path);
	const shown = names.length <= 3 ? names : names.slice(0, 2);
	const rest = names.length - shown.length;
	const list = shown.length === 1 ? shown[0] : rest ? `${shown.join(", ")} and ${rest} more` : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
	const sum = (key: "additions" | "deletions") => changes.reduce((total, change) => total + Math.max(0, change[key]), 0);
	return { label: `Changed ${list}`, files: changes.length, additions: sum("additions"), deletions: sum("deletions") };
}
