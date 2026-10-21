import type { Env } from "../src/env";
import type { Deps } from "../src/events";
import type { Installation } from "../src/installations";
import { encryptSlackSecrets } from "../src/lib/slack-secrets";
import type { SlackClient, SlackResult, SlackUser } from "../src/slack-api";
import { DbError, type Db } from "../src/supabase";
import { ThreadCoordinator } from "../src/coordinator";
import { WorkspaceMeter } from "../src/meter";

// Fakes for tests on Node: Durable Object state backed by a real SQLite database
// (node:sqlite), Durable Object namespaces that build the real classes, an
// in-memory Postgres for the few tables the Worker reads, and a Slack client that
// records calls. Every value is an obviously fake test value.

type SqliteStatement = { all(...params: unknown[]): Record<string, unknown>[] };
type SqliteDatabase = { prepare(sql: string): SqliteStatement; exec(sql: string): void };

const { DatabaseSync } = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } })
	.process.getBuiltinModule("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };

export class FakeStorage {
	readonly db = new DatabaseSync(":memory:");
	alarm: number | null = null;
	private savepoint = 0;

	readonly sql = {
		exec: (query: string, ...bindings: unknown[]) => {
			const rows = this.db.prepare(query).all(...bindings).map((row) => ({ ...row }));
			return {
				toArray: () => rows,
				one: () => {
					if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}`);
					return rows[0];
				},
				[Symbol.iterator]: () => rows[Symbol.iterator](),
			};
		},
	};

	transactionSync<T>(closure: () => T): T {
		const name = `sp${(this.savepoint += 1)}`;
		this.db.exec(`SAVEPOINT ${name}`);
		try {
			const result = closure();
			this.db.exec(`RELEASE ${name}`);
			return result;
		} catch (error) {
			this.db.exec(`ROLLBACK TO ${name}`);
			this.db.exec(`RELEASE ${name}`);
			throw error;
		}
	}

	async getAlarm() {
		return this.alarm;
	}

	async setAlarm(at: number | Date) {
		this.alarm = typeof at === "number" ? at : at.getTime();
	}

	async deleteAlarm() {
		this.alarm = null;
	}

	async deleteAll() {
		const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
		for (const { name } of tables) this.db.exec(`DROP TABLE "${name}"`);
	}

	tables(): string[] {
		return (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
	}

	count(table: string): number {
		return Number((this.db.prepare(`SELECT count(*) AS count FROM ${table}`).all()[0] as { count: number }).count);
	}
}

export function fakeState(storage = new FakeStorage()): DurableObjectState {
	return { storage, id: { toString: () => "test" }, waitUntil: () => undefined, blockConcurrencyWhile: async (fn: () => unknown) => fn() } as unknown as DurableObjectState;
}

export class FakeNamespace<T> {
	readonly instances = new Map<string, T>();
	constructor(private readonly create: (name: string) => T) {}
	idFromName(name: string) {
		return { name, toString: () => name };
	}
	get(id: { name: string }): T {
		let instance = this.instances.get(id.name);
		if (!instance) {
			instance = this.create(id.name);
			this.instances.set(id.name, instance);
		}
		return instance;
	}
}

export function storageOf(object: WorkspaceMeter | ThreadCoordinator): FakeStorage {
	return (object as unknown as { ctx: { storage: FakeStorage } }).ctx.storage;
}

export const TEST_ENCRYPTION_KEY = "phaseo-slack-test-key-v1";
export const TEST_STATE_SECRET = "phaseo-slack-test-state-secret";
export const HOSTED_SIGNING_SECRET = "test-hosted-signing-secret";
export const HOSTED_APP_ID = "A0HOSTED01";
export const COMPANY_APP_ID = "A0COMPANY1";
export const COMPANY_APP_ROW_ID = "00000000-0000-4000-8000-00000000c0a1";
export const COMPANY_SIGNING_SECRET = "test-company-signing-secret";
export const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000a1";
export const WORKSPACE_ID = "00000000-0000-4000-8000-0000000000b1";
export const TEAM_ID = "T0TEST0001";
export const BOT_USER_ID = "U0BOT00001";
export const BOT_TOKEN = "xoxb-1-test-token";

export type TestWorld = {
	env: Env;
	meters: FakeNamespace<WorkspaceMeter>;
	threads: FakeNamespace<ThreadCoordinator>;
	db: FakeDb;
	slack: FakeSlack;
	clock: { now: number };
	deps: Deps;
	turns: FakeWorkflow;
};

/** Records AGENT_TURNS.create calls; refuses a second instance with the same id, as Workflows does. */
export class FakeWorkflow {
	created: Array<{ id?: string; params?: unknown; retention?: unknown }> = [];
	async create(options: { id?: string; params?: unknown; retention?: unknown }) {
		if (this.created.some((entry) => entry.id === options.id)) throw new Error(`instance.already_exists: ${options.id} already exists`);
		this.created.push(options);
		return { id: options.id };
	}
}

export function testWorld(options: { now?: number; envOverrides?: Partial<Env> } = {}): TestWorld {
	const clock = { now: options.now ?? Date.UTC(2026, 9, 21, 12, 0, 0) };
	const db = new FakeDb();
	const slack = new FakeSlack();
	const env = {
		ENV: "test",
		PHASEO_WEB_ORIGIN: "https://phaseo.app",
		SLACK_SIGNING_SECRET: HOSTED_SIGNING_SECRET,
		SLACK_APP_ID: HOSTED_APP_ID,
		SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
		SLACK_STATE_SECRET: TEST_STATE_SECRET,
		SUPABASE_URL: "https://supabase.test",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
		...options.envOverrides,
	} as Env;
	const meters = new FakeNamespace<WorkspaceMeter>(() => {
		const meter = new WorkspaceMeter(fakeState(), env);
		meter.db = db;
		meter.recordPeople = async (installationId, period, people) => {
			db.flushes.push({ installationId, period, people: people.map((person) => ({ ...person })) });
		};
		return meter;
	});
	const threads = new FakeNamespace<ThreadCoordinator>(() => new ThreadCoordinator(fakeState(), env));
	env.METERS = meters as unknown as Env["METERS"];
	env.THREADS = threads as unknown as Env["THREADS"];
	const turns = new FakeWorkflow();
	env.AGENT_TURNS = turns as unknown as Env["AGENT_TURNS"];
	const deps: Deps = { env, db, slack: (token) => slack.client(token), now: () => clock.now };
	return { env, meters, threads, db, slack, clock, deps, turns };
}

export async function installationRow(overrides: Partial<Installation> = {}, secrets: Record<string, string> = {}): Promise<Installation> {
	return {
		id: INSTALLATION_ID,
		workspace_id: WORKSPACE_ID,
		slack_app_id: null,
		team_id: TEAM_ID,
		enterprise_id: null,
		bot_user_id: BOT_USER_ID,
		secrets_ciphertext: await encryptSlackSecrets(
			{ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY },
			{ bot_token: BOT_TOKEN, gateway_key: "phaseo_v1_sk_testkid00000_testsecret", ...secrets },
		),
		key_id: null,
		model: "phaseo/auto",
		instructions: null,
		access_mode: "everyone",
		usage_data_mode: "dm",
		usage_data_channel_ids: [],
		plan_people: 3,
		over_plan: "refuse",
		max_people: null,
		monthly_cap_nanos: 10_000_000_000,
		answers_per_person_hour: 60,
		allow_guests: true,
		allow_external_users: false,
		status: "active",
		...overrides,
	};
}

type Row = Record<string, unknown>;

function matches(value: unknown, filter: string): boolean {
	if (filter === "is.null") return value === null || value === undefined;
	if (filter === "is.false") return value === false;
	if (filter === "is.true") return value === true;
	if (filter.startsWith("eq.")) return value !== null && value !== undefined && String(value) === filter.slice(3);
	if (filter.startsWith("neq.")) return String(value) !== filter.slice(4);
	throw new Error(`fake db: unsupported filter ${filter}`);
}

const RESERVED = new Set(["select", "limit", "order", "or"]);

/** An in-memory PostgREST with eq, neq and is.null filters. */
export class FakeDb implements Db {
	tables: Record<string, Row[]> = {
		slack_installations: [], slack_apps: [], slack_user_links: [], workspace_audit_events: [],
		workspace_members: [], workspaces: [], wallets: [], v2_models: [],
	};
	/** What rpc() answers, by function name. */
	rpcResults: Record<string, unknown> = {};
	queries: Array<{ table: string; query: Record<string, string> }> = [];
	flushes: Array<{ installationId: string; period: string; people: Array<{ slack_user_id: string; first_answer_at: string; answers: number }> }> = [];
	rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

	private filter(table: string, query: Record<string, string>): Row[] {
		return (this.tables[table] ?? []).filter((row) => Object.entries(query).every(([column, filter]) => RESERVED.has(column) || matches(row[column], filter)));
	}

	async select<T>(table: string, query: Record<string, string>): Promise<T[]> {
		this.queries.push({ table, query });
		const rows = this.filter(table, query).slice(0, query.limit ? Number(query.limit) : undefined);
		const columns = query.select && query.select !== "*" ? query.select.split(",") : null;
		return rows.map((row) => (columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : { ...row })) as T[];
	}

	async insert(table: string, row: Row): Promise<void> {
		(this.tables[table] ??= []).push({ ...row });
	}

	async update<T>(table: string, filters: Record<string, string>, values: Row, columns: string): Promise<T[]> {
		const rows = this.filter(table, filters);
		for (const row of rows) Object.assign(row, values);
		return rows.map((row) => Object.fromEntries(columns.split(",").map((column) => [column, row[column]]))) as T[];
	}

	/** RPCs that fail as if Postgres were unavailable. */
	failingRpcs = new Set<string>();

	async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
		this.rpcs.push({ fn, args });
		if (this.failingRpcs.has(fn)) throw new DbError(503, null);
		if (fn === "uninstall_slack_agent_from_slack") {
			// The database function in short: once, and never for an event older than the install.
			const row = this.tables.slack_installations.find((installation) => installation.id === args.p_installation_id);
			if (!row || row.status === "uninstalled" || (row.installed_at && String(args.p_event_time) < String(row.installed_at))) return false as T;
			Object.assign(row, { status: "uninstalled", uninstalled_at: args.p_event_time });
			this.tables.workspace_audit_events.push({ action: "slack_agent.uninstalled_in_slack", target_id: row.id, metadata: { event: args.p_event } });
			return true as T;
		}
		return (this.rpcResults[fn] ?? null) as T;
	}
}

export type SlackCall = { token: string; method: string; args: Record<string, unknown> };

/** Records Web API calls. users.info answers from `users`; everything else is ok. */
export class FakeSlack {
	calls: SlackCall[] = [];
	users = new Map<string, SlackUser>();
	failUsersInfo = false;
	/** Errors the next calls of a method return, in order. */
	failures = new Map<string, string[]>();
	/** What conversations.replies answers. */
	replies: Array<Record<string, unknown>> = [];
	private streams = 0;

	client(token: string): SlackClient {
		return {
			call: async <T>(method: string, args: Record<string, unknown>): Promise<SlackResult<T>> => {
				this.calls.push({ token, method, args });
				const failure = this.failures.get(method)?.shift();
				if (failure === "ratelimited") return { ok: false, error: "ratelimited", retryAfterSeconds: 60 };
				if (failure) return { ok: false, error: failure };
				if (method === "chat.startStream") {
					this.streams += 1;
					return { ok: true, data: { ok: true, channel: args.channel, ts: `1792600100.${String(this.streams).padStart(6, "0")}` } as T };
				}
				if (method === "conversations.replies") return { ok: true, data: { ok: true, messages: this.replies } as T };
				if (method === "users.info") {
					if (this.failUsersInfo) return { ok: false, error: "ratelimited", retryAfterSeconds: 30 };
					const user = this.users.get(String(args.user)) ?? { id: String(args.user), team_id: TEAM_ID };
					return { ok: true, data: { ok: true, user } as T };
				}
				return { ok: true, data: { ok: true } as T };
			},
		};
	}

	ephemerals(): SlackCall[] {
		return this.calls.filter((call) => call.method === "chat.postEphemeral");
	}

	of(method: string): SlackCall[] {
		return this.calls.filter((call) => call.method === method);
	}
}

/** A Slack Events API envelope for a message from a person. */
export function eventEnvelope(event: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
	return {
		type: "event_callback",
		team_id: TEAM_ID,
		api_app_id: HOSTED_APP_ID,
		event_id: "Ev0TEST0001",
		event_time: 1_792_600_000,
		authorizations: [{ enterprise_id: null, team_id: TEAM_ID, user_id: BOT_USER_ID, is_bot: true, is_enterprise_install: false }],
		event,
		...overrides,
	};
}

export function mention(overrides: Record<string, unknown> = {}) {
	return { type: "app_mention", user: "U0PERSON01", text: "<@U0BOT00001> what did we spend this week?", ts: "1792600000.000100", channel: "C0CHANNEL1", event_ts: "1792600000.000100", ...overrides };
}

export function directMessage(overrides: Record<string, unknown> = {}) {
	return { type: "message", channel_type: "im", user: "U0PERSON01", text: "hello", ts: "1792600000.000200", channel: "D0DIRECT01", event_ts: "1792600000.000200", ...overrides };
}
