import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import {
    HEALTH_REPORT_MAX_AGE_MS, HEALTH_PUBLISH_INTERVAL_MS, HEALTH_SNAPSHOT_MAX_AGE_MS,
    healthPoolName, healthSnapshotKey, reduceHealth,
    type HealthObservation, type HealthEvidence, type HealthSnapshot, type HealthReceipt,
} from "@pipeline/execute/health-evidence";

type Metadata = { id: number; pool: string; version: number; published: number; published_at: number };
// Older reports are rejected outright, so their IDs need not be retained.
const DEDUPE_RETENTION_MS = HEALTH_REPORT_MAX_AGE_MS + 5_000;
const MAX_REPORT_IDS = 100_000;
const MAX_PROVIDERS = 1024;
/** Workers KV accepts one write per second per key. */
export const HEALTH_URGENT_PUBLISH_GAP_MS = 1_000;

/**
 * One coordination atom per endpoint/model pool.
 *
 * Observations run once per upstream call, so they touch memory only: report
 * deduplication, provider evidence, the version counter and the alarm time are
 * held in the object and loaded from storage once at construction. The alarm
 * persists dirty evidence and metadata, then publishes the KV snapshot. If the
 * object is evicted between alarms, at most one publish interval of best-effort
 * evidence is lost. A breaker state change pulls the alarm forward so outages
 * propagate without waiting for the regular interval.
 */
export class RoutingHealthDurableObject extends DurableObject<GatewayBindings> {
    private pool: string | null = null;
    private version = 0;
    private published = 0;
    private publishedAt = 0;
    /** Highest version whose observation changed a breaker state. */
    private urgentVersion = 0;
    private readonly providers = new Map<string, HealthEvidence>();
    private readonly dirty = new Set<string>();
    private metadataDirty = false;
    /** Report ID -> receipt time, in arrival order. Memory only. */
    private readonly reports = new Map<string, number>();
    private alarmAt: number | null = null;

    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            const sql = ctx.storage.sql;
            sql.exec(`
                CREATE TABLE IF NOT EXISTS providers (provider TEXT PRIMARY KEY, state TEXT NOT NULL) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), pool TEXT NOT NULL,
                    version INTEGER NOT NULL, published INTEGER NOT NULL, published_at INTEGER NOT NULL);
            `);
            const meta = sql.exec<Metadata>("SELECT * FROM metadata WHERE id=1").toArray()[0];
            if (meta) {
                this.pool = meta.pool;
                this.version = meta.version;
                this.published = meta.published;
                this.publishedAt = meta.published_at;
            }
            for (const row of sql.exec<{ provider: string; state: string }>("SELECT * FROM providers").toArray()) {
                this.providers.set(row.provider, JSON.parse(row.state) as HealthEvidence);
            }
            // Earlier versions persisted deduplication rows. Adopt any that are
            // still relevant once, then drop the table for good.
            const legacy = sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='reports'").toArray();
            if (legacy.length) {
                const cutoff = Date.now() - DEDUPE_RETENTION_MS;
                for (const row of sql.exec<{ id: string; received: number }>(
                    "SELECT id, received FROM reports WHERE received>=? ORDER BY received LIMIT ?", cutoff, MAX_REPORT_IDS).toArray()) {
                    this.reports.set(row.id, row.received);
                }
                sql.exec("DROP TABLE reports");
            }
            this.alarmAt = await ctx.storage.getAlarm();
            // Repair scheduling if unpublished state survived without an alarm.
            if (this.version > this.published) this.schedule(this.nextAlarmTime(Date.now()));
        });
    }

    private schedule(at: number): void {
        if (this.alarmAt !== null && this.alarmAt <= at) return;
        this.alarmAt = at;
        // Output gates hold the RPC response until this write is durable.
        void this.ctx.storage.setAlarm(at);
    }

    private nextAlarmTime(now: number): number {
        const urgent = this.urgentVersion > this.published;
        const gap = urgent ? HEALTH_URGENT_PUBLISH_GAP_MS : HEALTH_PUBLISH_INTERVAL_MS;
        return Math.max(now + (urgent ? 0 : HEALTH_PUBLISH_INTERVAL_MS), this.publishedAt + gap);
    }

    private pruneReports(now: number): void {
        const cutoff = now - DEDUPE_RETENTION_MS;
        for (const [id, received] of this.reports) {
            if (received >= cutoff && this.reports.size < MAX_REPORT_IDS) break;
            this.reports.delete(id);
        }
    }

    async observe(event: HealthObservation): Promise<HealthReceipt | null> {
        const now = Date.now();
        if (!event || typeof event.id !== "string" || event.id.length > 200 || !event.id ||
            typeof event.endpoint !== "string" || event.endpoint.length > 100 ||
            typeof event.model !== "string" || event.model.length > 500 ||
            typeof event.provider !== "string" || !event.provider || event.provider.length > 200 ||
            !Number.isFinite(event.observedAt) || !Number.isFinite(event.startedAt) ||
            event.startedAt > event.observedAt || !Number.isFinite(event.latencyMs) || event.latencyMs < 0 ||
            (event.tps !== null && (!Number.isFinite(event.tps) || event.tps < 0)) ||
            typeof event.ok !== "boolean" || typeof event.limited !== "boolean" || typeof event.probe !== "boolean") {
            throw new Error("Invalid health observation");
        }
        if (event.observedAt < now - HEALTH_REPORT_MAX_AGE_MS || event.observedAt > now + 5_000) return null;
        const pool = healthPoolName(event.endpoint, event.model);
        if (this.pool !== null && this.pool !== pool) throw new Error("Health pool mismatch");
        const previous = this.providers.get(event.provider);
        // Reports older than the retention window were already rejected above.
        if (this.reports.has(event.id)) return previous ? { health: previous, version: this.version } : null;
        if (!previous && this.providers.size >= MAX_PROVIDERS) throw new Error("Health pool provider limit exceeded");

        this.pruneReports(now);
        const next = reduceHealth(previous, event);
        this.pool = pool;
        this.reports.set(event.id, now);
        this.providers.set(event.provider, next);
        this.dirty.add(event.provider);
        this.version++;
        if ((previous?.breaker ?? "closed") !== next.breaker) this.urgentVersion = this.version;
        this.schedule(this.nextAlarmTime(now));
        return { health: next, version: this.version };
    }

    private persist(): void {
        if (!this.pool || (!this.dirty.size && !this.metadataDirty)) return;
        const sql = this.ctx.storage.sql;
        const providers = [...this.dirty];
        this.ctx.storage.transactionSync(() => {
            for (const provider of providers) {
                sql.exec("INSERT INTO providers VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET state=excluded.state",
                    provider, JSON.stringify(this.providers.get(provider)));
            }
            sql.exec(`INSERT INTO metadata VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                version=excluded.version, published=excluded.published, published_at=excluded.published_at`,
                this.pool, this.version, this.published, this.publishedAt);
        });
        this.dirty.clear();
        this.metadataDirty = false;
    }

    async alarm(): Promise<void> {
        this.alarmAt = null;
        const now = Date.now();
        this.pruneReports(now);
        if (!this.pool) return;
        const urgent = this.urgentVersion > this.published;
        const due = now - this.publishedAt >= (urgent ? HEALTH_URGENT_PUBLISH_GAP_MS : HEALTH_PUBLISH_INTERVAL_MS);
        if (this.version > this.published && due) {
            const [endpoint, model] = JSON.parse(this.pool) as [string, string];
            const version = this.version;
            const snapshot: HealthSnapshot = { version, publishedAt: now, providers: Object.fromEntries(this.providers) };
            // Persist before publishing so a published version is always durable.
            this.persist();
            try {
                await this.env.GATEWAY_CACHE.put(healthSnapshotKey(endpoint, model), JSON.stringify(snapshot), {
                    expirationTtl: HEALTH_SNAPSHOT_MAX_AGE_MS / 1000,
                });
            } catch (error) {
                console.warn("routing_health_publish_failed", { pool: this.pool });
                this.schedule(now + HEALTH_PUBLISH_INTERVAL_MS);
                throw error;
            }
            // Reports may arrive during KV I/O; they remain unpublished.
            this.published = version;
            this.publishedAt = now;
            this.metadataDirty = true;
        }
        this.persist();
        if (this.version > this.published) this.schedule(Math.max(Date.now() + 1000, this.nextAlarmTime(Date.now())));
    }
}
