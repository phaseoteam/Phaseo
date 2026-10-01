// Local-only native harness; none of these inspection/fault RPCs is deployed.
import { RoutingHealthDurableObject } from "../../src/core/routing-health-durable-object";
import { healthPoolName, type HealthObservation } from "../../src/pipeline/execute/health-evidence";
export class LocalRoutingHealthDurableObject extends RoutingHealthDurableObject {
    async runAlarm() { await this.ctx.storage.deleteAlarm(); await this.alarm(); }
    async inspect() {
        return { alarm: await this.ctx.storage.getAlarm(),
            metadata: this.ctx.storage.sql.exec("SELECT * FROM metadata").toArray(),
            providers: this.ctx.storage.sql.exec("SELECT * FROM providers").toArray(),
            reports: this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM reports").one().count };
    }
    async failCheckpoint() {
        this.ctx.storage.sql.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON providers BEGIN SELECT RAISE(ABORT,'scripted failure'); END");
        try { await this.runAlarm(); throw new Error("Expected checkpoint failure"); }
        catch { return this.inspect(); }
        finally { this.ctx.storage.sql.exec("DROP TRIGGER fail_checkpoint"); }
    }
    seedLegacy() {
        this.ctx.storage.sql.exec("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<4501) INSERT INTO reports SELECT 'legacy-' || n,0 FROM seq");
    }
}
export default {
    async fetch(request: Request, env: { ROUTING_HEALTH: DurableObjectNamespace<LocalRoutingHealthDurableObject> }) {
        const { operation, events } = await request.json() as { operation: string; events: HealthObservation[] };
        const first = events[0];
        const stub = env.ROUTING_HEALTH.get(env.ROUTING_HEALTH.idFromName(healthPoolName(first.endpoint, first.model)));
        try {
            if (operation === "observe") return Response.json(await Promise.all(events.map(event => stub.observe(event))));
            if (operation === "batch") return Response.json(await stub.observeBatch(events));
            if (operation === "alarm") { await stub.runAlarm(); return Response.json({ ok: true }); }
            if (operation === "inspect") return Response.json(await stub.inspect());
            if (operation === "fail") return Response.json(await stub.failCheckpoint());
            if (operation === "seed") { await stub.seedLegacy(); return Response.json({ ok: true }); }
            if (operation === "snapshot") return Response.json(await stub.getSnapshot());
            return new Response("Unknown operation", { status: 400 });
        } catch { return Response.json({ error: "rejected" }, { status: 400 }); }
    },
};
