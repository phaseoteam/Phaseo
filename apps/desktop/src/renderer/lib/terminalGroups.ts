/** T3's terminal layout: groups of up to four terminals split side by side or stacked, one group shown at a time. */
export const MAX_TERMINALS_PER_GROUP = 4;
export type SplitDirection = "horizontal" | "vertical";
export type TerminalGroup = { id: string; terminalIds: string[]; splitDirection: SplitDirection };
export type TerminalLayout = { groups: TerminalGroup[]; activeTerminalId?: string };

export const emptyLayout = (): TerminalLayout => ({ groups: [] });
export const layoutTerminalIds = (layout: TerminalLayout) => layout.groups.flatMap(group => group.terminalIds);
export const activeGroup = (layout: TerminalLayout) => layout.groups.find(group => layout.activeTerminalId !== undefined && group.terminalIds.includes(layout.activeTerminalId)) ?? layout.groups[0];

/** A new terminal in its own group, made active. */
export function addGroup(layout: TerminalLayout, terminalId: string): TerminalLayout {
	if (layoutTerminalIds(layout).includes(terminalId)) return { ...layout, activeTerminalId: terminalId };
	return { groups: [...layout.groups, { id: terminalId, terminalIds: [terminalId], splitDirection: "horizontal" }], activeTerminalId: terminalId };
}

export const canSplit = (layout: TerminalLayout) => (activeGroup(layout)?.terminalIds.length ?? 0) < MAX_TERMINALS_PER_GROUP;
/** A new terminal next to the active one. A group keeps the direction it was first split in, as in T3. */
export function split(layout: TerminalLayout, terminalId: string, direction: SplitDirection): TerminalLayout {
	const group = activeGroup(layout);
	if (!group) return addGroup(layout, terminalId);
	if (group.terminalIds.length >= MAX_TERMINALS_PER_GROUP || layoutTerminalIds(layout).includes(terminalId)) return layout;
	const at = layout.activeTerminalId ? group.terminalIds.indexOf(layout.activeTerminalId) : -1;
	const terminalIds = [...group.terminalIds]; terminalIds.splice(at < 0 ? terminalIds.length : at + 1, 0, terminalId);
	return { groups: layout.groups.map(value => value.id === group.id ? { ...group, terminalIds, splitDirection: group.terminalIds.length === 1 ? direction : group.splitDirection } : value), activeTerminalId: terminalId };
}

/** Removes a terminal; its neighbour in the group (or the next group) becomes active. */
export function removeTerminal(layout: TerminalLayout, terminalId: string): TerminalLayout {
	const groupIndex = layout.groups.findIndex(group => group.terminalIds.includes(terminalId));
	if (groupIndex < 0) return layout;
	const group = layout.groups[groupIndex], index = group.terminalIds.indexOf(terminalId);
	const terminalIds = group.terminalIds.filter(id => id !== terminalId);
	const groups = terminalIds.length ? layout.groups.map((value, at) => at === groupIndex ? { ...group, terminalIds } : value) : layout.groups.filter((_, at) => at !== groupIndex);
	if (layout.activeTerminalId !== terminalId) return { groups, activeTerminalId: layout.activeTerminalId };
	const activeTerminalId = terminalIds[Math.min(index, terminalIds.length - 1)] ?? groups[Math.min(groupIndex, groups.length - 1)]?.terminalIds[0];
	return { groups, ...(activeTerminalId ? { activeTerminalId } : {}) };
}

/** Drops terminals that no longer exist and adopts ones the layout has not seen. */
export function reconcile(layout: TerminalLayout, existing: readonly string[], adopt: readonly string[] = []): TerminalLayout {
	let next = layout;
	for (const id of layoutTerminalIds(layout)) if (!existing.includes(id)) next = removeTerminal(next, id);
	for (const id of adopt) if (existing.includes(id) && !layoutTerminalIds(next).includes(id)) next = { ...addGroup(next, id), activeTerminalId: next.activeTerminalId ?? id };
	if (next.activeTerminalId && !layoutTerminalIds(next).includes(next.activeTerminalId)) next = { ...next, activeTerminalId: layoutTerminalIds(next)[0] };
	return next;
}

export const groupLabel = (group: TerminalGroup) => group.terminalIds.length < 2 ? "Single" : group.splitDirection === "vertical" ? "Stacked" : "Side by side";
