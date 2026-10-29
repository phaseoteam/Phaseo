// phaseo-realtime: hosts only the realtime relay Durable Object. Deploying a
// Worker restarts its Durable Objects and ends their WebSockets, so the relay
// lives apart from phaseo-gateway (deployed on every merge) and is deployed only
// in announced maintenance windows (.agents/skills/realtime-maintenance).
// Clients still connect through api.phaseo.app: the gateway's relay route
// forwards to this Worker through the REALTIME_RELAY binding (script_name), and
// gateway deploys don't end those connections.
export { RealtimeRelayDurableObject } from "@core/realtime-relay-durable-object";

export default {
	async fetch(): Promise<Response> {
		// No public routes: the gateway and jobs Workers reach the relay through
		// their Durable Object bindings.
		return new Response("not found", { status: 404 });
	},
};
