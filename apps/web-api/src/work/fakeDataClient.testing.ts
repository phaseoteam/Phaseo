// A small stand-in for the Supabase client in work tracker tests. Every query is recorded with its
// table, operation, payload and filters; a handler decides each result.

export type FakeQuery = {
	table: string;
	op: "select" | "insert" | "update" | "delete" | "upsert";
	payload?: unknown;
	columns?: string;
	filters: Array<[string, ...unknown[]]>;
};

export type FakeResult = { data: unknown; error: { message: string } | null };
export type FakeHandler = (query: FakeQuery) => FakeResult | undefined;

const FILTERS = ["eq", "neq", "ilike", "is", "in", "order", "limit", "gt", "lt", "gte", "lte"] as const;

export function fakeDataClient(handler: FakeHandler = () => undefined) {
	const queries: FakeQuery[] = [];
	const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	let rpcHandler: (name: string, args: Record<string, unknown>) => FakeResult = () => ({ data: null, error: null });

	function builder(table: string) {
		const query: FakeQuery = { table, op: "select", filters: [] };
		let recorded = false;
		const run = (): Promise<FakeResult> => {
			if (!recorded) {
				queries.push(query);
				recorded = true;
			}
			return Promise.resolve(handler(query) ?? { data: null, error: null });
		};
		const chain: Record<string, unknown> = {
			select(columns?: string) {
				if (query.op === "select") query.columns = columns;
				return chain;
			},
			insert(payload: unknown) {
				query.op = "insert";
				query.payload = payload;
				return chain;
			},
			update(payload: unknown) {
				query.op = "update";
				query.payload = payload;
				return chain;
			},
			upsert(payload: unknown) {
				query.op = "upsert";
				query.payload = payload;
				return chain;
			},
			delete() {
				query.op = "delete";
				return chain;
			},
			maybeSingle: run,
			single: run,
			then(resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) {
				return run().then(resolve, reject);
			},
		};
		for (const name of FILTERS) {
			chain[name] = (...args: unknown[]) => {
				query.filters.push([name, ...args]);
				return chain;
			};
		}
		return chain;
	}

	const client = {
		from: (table: string) => builder(table),
		rpc: (name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			return Promise.resolve(rpcHandler(name, args));
		},
	};
	return {
		client: client as any,
		queries,
		rpcCalls,
		onRpc(next: (name: string, args: Record<string, unknown>) => FakeResult) {
			rpcHandler = next;
		},
	};
}

export function hasFilter(query: FakeQuery, name: string, ...args: unknown[]): boolean {
	return query.filters.some(([filter, ...rest]) => filter === name && JSON.stringify(rest) === JSON.stringify(args));
}
