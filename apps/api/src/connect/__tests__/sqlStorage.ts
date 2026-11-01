import { DatabaseSync } from "node:sqlite";

/** SqlStorage over node:sqlite, so ConnectRoom's real SQL runs in tests. */
export function sqlStorage() {
	const db = new DatabaseSync(":memory:");
	return {
		db,
		exec(query: string, ...bindings: unknown[]) {
			const trimmed = query.trim();
			let rows: Record<string, unknown>[] = [];
			if (/^SELECT/i.test(trimmed)) rows = db.prepare(trimmed).all(...(bindings as never[])) as Record<string, unknown>[];
			else if (bindings.length === 0) db.exec(trimmed);
			else db.prepare(trimmed).run(...(bindings as never[]));
			return { toArray: () => rows, one: () => rows[0] };
		},
	};
}
