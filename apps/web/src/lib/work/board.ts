import { WORK_ITEM_STATES, type WorkItem, type WorkItemState } from "./types";

export type BoardColumn = { state: WorkItemState; items: WorkItem[] };

/** Board columns, one per state in workflow order. Items keep their incoming order (latest update first). */
export function boardColumns(items: WorkItem[], states: readonly WorkItemState[] = WORK_ITEM_STATES): BoardColumn[] {
	const byState = new Map<WorkItemState, WorkItem[]>(states.map((state) => [state, []]));
	for (const item of items) byState.get(item.state)?.push(item);
	return states.map((state) => ({ state, items: byState.get(state) ?? [] }));
}

/** Pending state moves made on the board, keyed by item number, applied over server data until it catches up. */
export type BoardMoves = Record<number, WorkItemState>;

export type BoardMoveAction =
	| { type: "move"; number: number; state: WorkItemState }
	| { type: "rollback"; number: number; previous: WorkItemState | undefined }
	| { type: "settle"; items: WorkItem[] };

export function boardMovesReducer(moves: BoardMoves, action: BoardMoveAction): BoardMoves {
	switch (action.type) {
		case "move":
			return moves[action.number] === action.state ? moves : { ...moves, [action.number]: action.state };
		case "rollback": {
			const next = { ...moves };
			if (action.previous === undefined) delete next[action.number];
			else next[action.number] = action.previous;
			return next;
		}
		case "settle": {
			// Drop the moves the server data now shows.
			let changed = false;
			const next: BoardMoves = { ...moves };
			for (const item of action.items) {
				if (next[item.number] !== undefined && next[item.number] === item.state) {
					delete next[item.number];
					changed = true;
				}
			}
			return changed ? next : moves;
		}
	}
}

/** Items with optimistic moves applied. A moved item counts as just updated, so it rises to the top of its column. */
export function applyBoardMoves(items: WorkItem[], moves: BoardMoves, now: string = new Date().toISOString()): WorkItem[] {
	if (!Object.keys(moves).length) return items;
	const moved: WorkItem[] = [];
	const rest: WorkItem[] = [];
	for (const item of items) {
		const state = moves[item.number];
		if (state && state !== item.state) moved.push({ ...item, state, updatedAt: now });
		else rest.push(item);
	}
	return [...moved, ...rest];
}

/** The state a card dropped on a column moves to, or null when nothing changes. */
export function dropTarget(item: Pick<WorkItem, "state">, overId: string | number | null | undefined): WorkItemState | null {
	if (typeof overId !== "string" || !overId.startsWith("column:")) return null;
	const state = overId.slice(7);
	if (!(WORK_ITEM_STATES as readonly string[]).includes(state)) return null;
	return state === item.state ? null : (state as WorkItemState);
}
