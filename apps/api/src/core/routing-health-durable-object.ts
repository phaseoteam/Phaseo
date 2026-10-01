import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import {
    HEALTH_REPORT_MAX_AGE_MS, HEALTH_PUBLISH_INTERVAL_MS, HEALTH_SNAPSHOT_MAX_AGE_MS,
    healthPoolName, healthSnapshotKey, reduceHealth,
    type HealthObservation, type HealthEvidence, type HealthSnapshot, type HealthReceipt,
} from "@pipeline/execute/health-evidence";

type Metadata = { id: number; pool: string; version: number; published: number; published_at: number };
const DEDUPE_RETENTION_MS = 5 * 60_000;

/** One coordination atom per endpoint/model pool. No reads on the routing path,
 * no sockets/timers, and only a finite cleanup alarm once the pool becomes idle. */
export class RoutingHealthDurableObject extends DurableObject<GatewayBindings> {
    constructor(ctx: DurableObjectState, env: GatewayBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS providers (provider TEXT PRIMARY KEY, state TEXT NOT NULL) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, received INTEGER NOT NULL) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS reports_received ON reports(received);
                CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), pool TEXT NOT NULL,
                    version INTEGER NOT NULL, published INTEGER NOT NULL, published_at INTEGER NOT NULL);
            `);
        });
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
        // Arm publication before acknowledging any durable observation. This
        // also repairs scheduling after a prior publication exhausted retries.
        const alarm = await this.ctx.storage.getAlarm();
        if (alarm === null || alarm > now + HEALTH_PUBLISH_INTERVAL_MS) await this.ctx.storage.setAlarm(now + HEALTH_PUBLISH_INTERVAL_MS);
        return this.ctx.storage.transactionSync(() => {
            const sql = this.ctx.storage.sql;
            const pool = healthPoolName(event.endpoint, event.model);
            const meta = sql.exec<Metadata>("SELECT * FROM metadata WHERE id=1").toArray()[0];
            if (meta && meta.pool !== pool) throw new Error("Health pool mismatch");
            const previous = sql.exec<{ state: string }>("SELECT state FROM providers WHERE provider=?", event.provider).toArray()[0];
            const state = previous ? JSON.parse(previous.state) as HealthEvidence : undefined;
            if (sql.exec("SELECT id FROM reports WHERE id=?", event.id).toArray().length) return state ? { health: state, version: meta.version } : null;
            if (!state && sql.exec<{ count: number }>("SELECT count(*) AS count FROM providers").one().count >= 1024) {
                throw new Error("Health pool provider limit exceeded");
            }
            const next = reduceHealth(state, event);
            sql.exec("INSERT INTO reports VALUES (?,?)", event.id, now);
            sql.exec("INSERT INTO providers VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET state=excluded.state", event.provider, JSON.stringify(next));
            sql.exec(`INSERT INTO metadata VALUES (1,?,1,0,0)
                ON CONFLICT(id) DO UPDATE SET version=version+1`, pool);
            return { health: next, version: (meta?.version ?? 0) + 1 };
        });
    }

    async alarm(): Promise<void> {
        const sql = this.ctx.storage.sql;
        const now = Date.now();
        // Bounded cleanup; retries older than two minutes are rejected even
        // after their deduplication row is removed.
        sql.exec("DELETE FROM reports WHERE id IN (SELECT id FROM reports WHERE received<? LIMIT 2000)", now - DEDUPE_RETENTION_MS);
        const meta = sql.exec<Metadata>("SELECT * FROM metadata WHERE id=1").toArray()[0];
        if (!meta) return;
        if (meta.version > meta.published && now - meta.published_at >= HEALTH_PUBLISH_INTERVAL_MS) {
            const [endpoint, model] = JSON.parse(meta.pool) as [string, string];
            const providers = Object.fromEntries(sql.exec<{ provider: string; state: string }>("SELECT * FROM providers")
                .toArray().map(row => [row.provider, JSON.parse(row.state) as HealthEvidence]));
            const snapshot: HealthSnapshot = { version: meta.version, publishedAt: now, providers };
            try {
                await this.env.GATEWAY_CACHE.put(healthSnapshotKey(endpoint, model), JSON.stringify(snapshot), {
                    expirationTtl: HEALTH_SNAPSHOT_MAX_AGE_MS / 1000,
                });
            } catch (error) {
                console.warn("routing_health_publish_failed", { pool: meta.pool });
                await this.ctx.storage.setAlarm(now + HEALTH_PUBLISH_INTERVAL_MS);
                throw error;
            }
            // Only this alarm publishes. Reports may arrive during KV I/O;
            // acknowledging this revision leaves those newer reports dirty.
            sql.exec("UPDATE metadata SET published=?,published_at=? WHERE id=1", meta.version, now);
        }
        const current = sql.exec<Metadata>("SELECT * FROM metadata WHERE id=1").one();
        const oldest = sql.exec<{ received: number }>("SELECT received FROM reports ORDER BY received LIMIT 1").toArray()[0];
        let next = current.version > current.published ? Math.max(Date.now() + 1000, current.published_at + HEALTH_PUBLISH_INTERVAL_MS) : Infinity;
        // Drain an expired backlog in bounded chunks instead of retaining it
        // forever when a pool receives more than 2,000 reports per minute.
        if (oldest) next = Math.min(next, Math.max(Date.now() + 1000, oldest.received + DEDUPE_RETENTION_MS + 1));
        if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    }
}
