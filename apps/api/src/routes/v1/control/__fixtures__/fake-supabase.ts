// A small in-memory stand-in for the Supabase admin client, for route tests.
// Supports the filters and writes the control-plane routes use; selects
// return whole rows (embedded relations are stored on the row itself).

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export type FakeDb = {
	tables: Record<string, Row[]>;
	client: { from: (table: string) => any };
};

let sequence = 0;

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
	const db: FakeDb = { tables, client: { from: (table: string) => builder(db, table) } };
	return db;
}

function builder(db: FakeDb, table: string) {
	const filters: Filter[] = [];
	let mutation: { kind: "insert" | "update" | "upsert" | "delete"; value?: any; conflict?: string[] } | null = null;
	let head = false;
	let limit: number | null = null;
	const rows = () => (db.tables[table] ??= []);
	const matched = () => rows().filter((row) => filters.every((filter) => filter(row)));

	function run(): { data: any; error: null; count?: number } {
		if (!mutation) {
			const found = matched();
			const data = limit === null ? found : found.slice(0, limit);
			return head ? { data: null, error: null, count: found.length } : { data, error: null, count: found.length };
		}
		if (mutation.kind === "insert") {
			const inserted = (Array.isArray(mutation.value) ? mutation.value : [mutation.value])
				.map((row: Row) => ({ id: `row_${++sequence}`, created_at: new Date().toISOString(), ...row }));
			rows().push(...inserted);
			return { data: inserted, error: null };
		}
		if (mutation.kind === "upsert") {
			const value = mutation.value as Row;
			const existing = rows().find((row) => mutation!.conflict!.every((column) => row[column] === value[column]));
			if (existing) {
				Object.assign(existing, value);
				return { data: [existing], error: null };
			}
			const inserted = { id: `row_${++sequence}`, ...value };
			rows().push(inserted);
			return { data: [inserted], error: null };
		}
		const targets = matched();
		if (mutation.kind === "update") targets.forEach((row) => Object.assign(row, mutation!.value));
		else db.tables[table] = rows().filter((row) => !targets.includes(row));
		return { data: targets, error: null };
	}

	const query: any = {
		select: (_columns?: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
		neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
		is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return query; },
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
		or: () => query,
		not: () => query,
		order: () => query,
		range: () => query,
		limit: (count: number) => { limit = count; return query; },
		insert: (value: any) => { mutation = { kind: "insert", value }; return query; },
		update: (value: any) => { mutation = { kind: "update", value }; return query; },
		upsert: (value: any, options?: { onConflict?: string }) => {
			mutation = { kind: "upsert", value, conflict: String(options?.onConflict ?? "id").split(",") };
			return query;
		},
		delete: () => { mutation = { kind: "delete" }; return query; },
		maybeSingle: async () => {
			const result = run();
			const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
			return { data, error: null };
		},
		then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
			try { return Promise.resolve(run()).then(resolve, reject); } catch (error) { return Promise.reject(error).then(resolve, reject); }
		},
	};
	return query;
}
