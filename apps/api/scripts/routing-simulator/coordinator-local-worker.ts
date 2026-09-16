// Local Miniflare harness. Never exported from the gateway or deployed.
import { RoutingHealthDurableObject } from "../../src/core/routing-health-durable-object";
import { healthPoolName, healthSnapshotKey, type HealthObservation } from "../../src/pipeline/execute/health-evidence";
export class LocalRoutingHealthDurableObject extends RoutingHealthDurableObject {
    async runAlarm() { await this.alarm(); }
    async inspect() {
        return { alarm: await this.ctx.storage.getAlarm(), metadata: this.ctx.storage.sql.exec("SELECT * FROM metadata").toArray() };
    }
    async forcePublication() { this.ctx.storage.sql.exec("UPDATE metadata SET published_at=0"); }
    async publishWithArrival(event: HealthObservation) {
        const original = this.env.GATEWAY_CACHE;
        this.env.GATEWAY_CACHE = { put: async (...args: Parameters<KVNamespace["put"]>) => {
            await this.observe(event);
            await original.put(...args);
        } } as unknown as KVNamespace;
        try { await this.alarm(); return await this.inspect(); }
        finally { this.env.GATEWAY_CACHE = original; }
    }
    async failPublication() {
        const original = this.env.GATEWAY_CACHE;
        this.env.GATEWAY_CACHE = { put: async () => { throw new Error("Scripted KV outage"); } } as unknown as KVNamespace;
        try { await this.alarm(); } catch { return this.inspect(); }
        finally { this.env.GATEWAY_CACHE = original; }
        throw new Error("Expected publication failure");
    }
}
export default {
    async fetch(request: Request, env: { ROUTING_HEALTH: DurableObjectNamespace<LocalRoutingHealthDurableObject>; GATEWAY_CACHE: KVNamespace }) {
        const { operation, events } = await request.json() as { operation: string; events: HealthObservation[] };
        const first = events[0];
        const stub = env.ROUTING_HEALTH.get(env.ROUTING_HEALTH.idFromName(healthPoolName(first.endpoint, first.model)));
        if (operation === "observe") return Response.json(await Promise.all(events.map(event => stub.observe(event))));
        if (operation === "alarm") { await stub.runAlarm(); return Response.json({ ok: true }); }
        if (operation === "inspect") return Response.json(await stub.inspect());
        if (operation === "force") { await stub.forcePublication(); return Response.json({ ok: true }); }
        if (operation === "fail") return Response.json(await stub.failPublication());
        if (operation === "interleave") return Response.json(await stub.publishWithArrival(first));
        if (operation === "snapshot") return Response.json(await env.GATEWAY_CACHE.get(healthSnapshotKey(first.endpoint, first.model), "json"));
        return new Response("Unknown operation", { status: 400 });
    },
};
