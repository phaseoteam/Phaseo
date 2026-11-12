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

/** A folder or file in a turn's changes; a folder's counts total its files', and binary files (-1) count as nothing. */
export type ChangedNode = { name: string; path: string; additions: number; deletions: number; binary?: true; children?: ChangedNode[] };

/** The turn's files as folders and files, folders first by name, with single-folder chains joined ("src/lib"). */
export function changedFilesTree(changes: readonly TurnFileChange[]): ChangedNode[] {
	const root: ChangedNode = { name: "", path: "", additions: 0, deletions: 0, children: [] };
	for (const change of changes) {
		const parts = change.path.replaceAll("\\", "/").split("/").filter(Boolean);
		let node = root;
		const additions = Math.max(0, change.additions), deletions = Math.max(0, change.deletions);
		parts.forEach((part, index) => {
			node.additions += additions; node.deletions += deletions;
			const path = parts.slice(0, index + 1).join("/"), last = index === parts.length - 1;
			let child = node.children!.find(value => value.path === path && !value.children === last);
			if (!child) { child = { name: part, path, additions: 0, deletions: 0, ...last ? {} : { children: [] } }; node.children!.push(child); }
			if (last) { child.additions = additions; child.deletions = deletions; if (change.additions < 0) child.binary = true; }
			node = child;
		});
	}
	const order = (a: ChangedNode, b: ChangedNode) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name, undefined, { numeric: true });
	const compact = (node: ChangedNode): ChangedNode => {
		let current = node;
		while (current.children?.length === 1 && current.children[0].children) { const only = current.children[0]; current = { ...only, name: `${current.name}/${only.name}` }; }
		return current.children ? { ...current, children: current.children.map(compact).sort(order) } : current;
	};
	return root.children!.map(compact).sort(order);
}

/** Every folder's path, for Expand all. */
export const changedFolders = (nodes: readonly ChangedNode[]): string[] => nodes.flatMap(node => node.children ? [node.path, ...changedFolders(node.children)] : []);
