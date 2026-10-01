import { DurableObject } from "cloudflare:workers";
import { LRUCache } from "lru-cache";
import type { GatewayBindings } from "@/runtime/env.types";
import {
    HEALTH_REPORT_MAX_AGE_MS, healthPoolName, reduceHealth,
    type HealthObservation, type HealthEvidence, type HealthSnapshot, type HealthReceipt,
} from "@pipeline/execute/health-evidence";

type Metadata = { pool: string; version: number; published_at: number };
const CHECKPOINT_INTERVAL_MS = 30_000;
const MAX_PROVIDERS = 1024;
export const HEALTH_BATCH_MAX = 64;

/** Advisory state only: crashes may lose uncheckpointed samples and dedupe.
 * Never financial authority. One bounded atom per endpoint/model, idle alarms stop. */
export class RoutingHealthDurableObject extends DurableObject<GatewayBindings> {
    private readonly providers = new Map<string, HealthEvidence>();
    private readonly seen = new LRUCache<string, true>({ max: 16_384, ttl: HEALTH_REPORT_MAX_AGE_MS });
    private readonly dirty = new Set<string>();
    private readonly generation = crypto.randomUUID();
    private pool: string | undefined;
    private version = 0;
    private observedAt = 0;
    private alarmAt: number | null = null;

    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            // Preserve schema and aggregate rows for rolling upgrades.
            ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS providers (provider TEXT PRIMARY KEY, state TEXT NOT NULL) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, received INTEGER NOT NULL) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS reports_received ON reports(received);
                CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), pool TEXT NOT NULL,
                    version INTEGER NOT NULL, published INTEGER NOT NULL, published_at INTEGER NOT NULL);
            `);
            const meta = ctx.storage.sql.exec<Metadata>("SELECT * FROM metadata WHERE id=1").toArray()[0];
            this.pool = meta?.pool;
            this.version = meta?.version ?? 0;
            for (const row of ctx.storage.sql.exec<{ provider: string; state: string }>("SELECT * FROM providers LIMIT 1024").toArray()) {
                const state = JSON.parse(row.state) as HealthEvidence;
                this.providers.set(row.provider, state);
                this.observedAt = Math.max(this.observedAt, state.last_updated);
            }
            this.alarmAt = await ctx.storage.getAlarm();
        });
    }

    async observe(event: HealthObservation): Promise<HealthReceipt | null> {
        return (await this.observeBatch([event]))[0];
    }

    async observeBatch(events: HealthObservation[]): Promise<Array<HealthReceipt | null>> {
        if (!Array.isArray(events) || events.length === 0 || events.length > HEALTH_BATCH_MAX) throw new Error("Invalid health batch");
        const now = Date.now();
        const expectedPool = this.pool ?? healthPoolName(events[0]?.endpoint, events[0]?.model);
        const incomingProviders = new Set(this.providers.keys());
        // Validate the whole batch before mutation, including capacity/pool identity.
        for (const event of events) {
            validateObservation(event);
            if (healthPoolName(event.endpoint, event.model) !== expectedPool) throw new Error("Health pool mismatch");
            if (event.observedAt >= now - HEALTH_REPORT_MAX_AGE_MS && event.observedAt <= now + 5000) incomingProviders.add(event.provider);
        }
        if (incomingProviders.size > MAX_PROVIDERS) throw new Error("Health pool provider limit exceeded");
        const results = events.map(event => {
            if (event.observedAt < now - HEALTH_REPORT_MAX_AGE_MS || event.observedAt > now + 5000) return null;
            this.pool = expectedPool;
            if (!this.seen.has(event.id)) {
                this.providers.set(event.provider, reduceHealth(this.providers.get(event.provider), event));
                this.seen.set(event.id, true);
                this.dirty.add(event.provider);
                this.version++;
                this.observedAt = Math.max(this.observedAt, event.observedAt);
            }
            const health = this.providers.get(event.provider);
            return health ? { health: { ...health }, version: this.version, generation: this.generation } : null;
        });
        if (this.dirty.size && this.alarmAt === null) {
            this.alarmAt = now + CHECKPOINT_INTERVAL_MS;
            try { await this.ctx.storage.setAlarm(this.alarmAt); }
            catch (error) { this.alarmAt = null; throw error; }
        }
        return results;
    }

    getSnapshot(): HealthSnapshot {
        // Reads never renew evidence age, touch storage or schedule alarms.
        return { version: this.version, generation: this.generation, publishedAt: this.observedAt,
            providers: Object.fromEntries([...this.providers].map(([provider, state]) => [provider, { ...state }])) };
    }

    async alarm(): Promise<void> {
        this.alarmAt = null;
        // No await while checkpointing: arrivals cannot be acknowledged away.
        this.ctx.storage.transactionSync(() => {
            const sql = this.ctx.storage.sql;
            for (const provider of this.dirty) {
                sql.exec("INSERT INTO providers VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET state=excluded.state",
                    provider, JSON.stringify(this.providers.get(provider)));
            }
            if (this.dirty.size) sql.exec(`INSERT INTO metadata VALUES (1,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET pool=excluded.pool,version=excluded.version,published=excluded.published,published_at=excluded.published_at`,
                this.pool!, this.version, this.version, this.observedAt);
            // Bounded retirement of old advisory dedupe rows; no new report writes.
            sql.exec("DELETE FROM reports WHERE id IN (SELECT id FROM reports LIMIT 2000)");
        });
        this.dirty.clear();
        const legacy = this.ctx.storage.sql.exec("SELECT id FROM reports LIMIT 1").toArray().length > 0;
        if (legacy) {
            this.alarmAt = Date.now() + CHECKPOINT_INTERVAL_MS;
            await this.ctx.storage.setAlarm(this.alarmAt);
        }
        // Clean/empty objects never self-reschedule; future traffic re-arms.
    }
}

function validateObservation(event: HealthObservation): void {
    if (!event || typeof event.id !== "string" || event.id.length > 200 || !event.id ||
        typeof event.endpoint !== "string" || !event.endpoint || event.endpoint.length > 100 ||
        typeof event.model !== "string" || !event.model || event.model.length > 500 ||
        typeof event.provider !== "string" || !event.provider || event.provider.length > 200 ||
        !Number.isFinite(event.observedAt) || !Number.isFinite(event.startedAt) ||
        event.startedAt > event.observedAt || !Number.isFinite(event.latencyMs) || event.latencyMs < 0 ||
        (event.tps !== null && (!Number.isFinite(event.tps) || event.tps < 0)) ||
        typeof event.ok !== "boolean" || typeof event.limited !== "boolean" || typeof event.probe !== "boolean") {
        throw new Error("Invalid health observation");
    }
}
