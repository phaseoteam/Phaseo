// Bulk selection on the list: checkboxes, x to toggle the focused row, shift-click for a range.

export type Selection = { numbers: number[]; anchor: number | null };

export const EMPTY_SELECTION: Selection = { numbers: [], anchor: null };

/** Selections are capped at what the bulk endpoint accepts. */
export const MAX_BULK_SELECTION = 100;

export type SelectionAction =
	| { type: "toggle"; number: number }
	/** Shift-click: selects every row from the anchor to this one, in the order shown. */
	| { type: "range"; number: number; order: number[] }
	| { type: "set"; numbers: number[] }
	| { type: "clear" }
	/** Drops rows no longer shown. */
	| { type: "prune"; order: number[] };

function capped(numbers: number[]): number[] {
	return numbers.length > MAX_BULK_SELECTION ? numbers.slice(0, MAX_BULK_SELECTION) : numbers;
}

export function selectionReducer(state: Selection, action: SelectionAction): Selection {
	switch (action.type) {
		case "toggle": {
			const selected = state.numbers.includes(action.number);
			const numbers = selected ? state.numbers.filter((number) => number !== action.number) : capped([...state.numbers, action.number]);
			return { numbers, anchor: action.number };
		}
		case "range": {
			const from = state.anchor === null ? -1 : action.order.indexOf(state.anchor);
			const to = action.order.indexOf(action.number);
			if (to < 0) return state;
			if (from < 0) return selectionReducer(state, { type: "toggle", number: action.number });
			const [start, end] = from <= to ? [from, to] : [to, from];
			const range = action.order.slice(start, end + 1);
			const numbers = capped([...new Set([...state.numbers, ...range])]);
			return { numbers, anchor: action.number };
		}
		case "set":
			return { numbers: capped([...new Set(action.numbers)]), anchor: action.numbers.at(-1) ?? null };
		case "clear":
			return state.numbers.length || state.anchor !== null ? EMPTY_SELECTION : state;
		case "prune": {
			const shown = new Set(action.order);
			const numbers = state.numbers.filter((number) => shown.has(number));
			const anchor = state.anchor !== null && shown.has(state.anchor) ? state.anchor : null;
			return numbers.length === state.numbers.length && anchor === state.anchor ? state : { numbers, anchor };
		}
	}
}

export function isSelected(selection: Selection, number: number): boolean {
	return selection.numbers.includes(number);
}

/** Labels typed into the bulk bar as "+bug -billing" or "bug, -billing": additions and removals. */
export function parseLabelChanges(value: string): { labelsAdd: string[]; labelsRemove: string[] } {
	const labelsAdd: string[] = [];
	const labelsRemove: string[] = [];
	for (const raw of value.split(/[,\s]+/)) {
		const token = raw.trim().toLowerCase();
		if (!token) continue;
		const remove = token.startsWith("-");
		const label = token.replace(/^[+-]/, "").slice(0, 40);
		if (!label) continue;
		const list = remove ? labelsRemove : labelsAdd;
		if (!list.includes(label)) list.push(label);
	}
	return { labelsAdd: labelsAdd.slice(0, 20), labelsRemove: labelsRemove.slice(0, 20) };
}
