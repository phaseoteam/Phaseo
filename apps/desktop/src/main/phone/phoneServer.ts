import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { phoneLimits } from "@phaseo/phone-protocol";
import type { PhonePairing } from "./phoneDevices";
import type { PhoneHub } from "./phoneSession";

export type PhoneServerPorts = { hub: PhoneHub; pairing: PhonePairing; desktopId: () => string; desktopName: () => string };
const keepAliveMs = 30_000;

async function readBody(request: IncomingMessage, limit: number) {
	const chunks: Buffer[] = []; let bytes = 0;
	for await (const chunk of request as AsyncIterable<Buffer>) { bytes += chunk.length; if (bytes > limit) throw new Error("too large"); chunks.push(chunk); }
	return Buffer.concat(chunks).toString("utf8");
}
const json = (response: ServerResponse, status: number, body: unknown) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body)); };

/**
 * The phone server: one HTTP server per chosen address, all on one port. It answers a health check, POST /pair, and
 * WebSockets at /v1/phone signed in with a device token. Every frame goes to the PhoneHub, which runs it through the
 * app's own commands.
 */
export class PhoneServer {
	private servers: Server[] = [];
	private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: phoneLimits.frameBytes });
	private keepAlive?: ReturnType<typeof setInterval>;
	port = 0;
	constructor(private readonly ports: PhoneServerPorts) {}

	/** Listens on each host; returns the port and the hosts that failed, in words. Port 0 picks one (tests). */
	async listen(hosts: string[], port: number) {
		await this.close();
		const errors: string[] = [];
		this.port = port;
		for (const host of hosts) {
			const server = createServer((request, response) => void this.handle(request, response).catch(() => { if (!response.headersSent) json(response, 500, { error: "The phone server failed." }); }));
			server.on("upgrade", (request, socket, head) => this.upgrade(request, socket, head));
			const error = await new Promise<NodeJS.ErrnoException | undefined>(resolve => { server.once("error", resolve); server.listen(this.port, host, () => resolve(undefined)); });
			if (error) { errors.push(error.code === "EADDRINUSE" ? `Port ${this.port} is in use on ${host}.` : `Could not listen on ${host}.`); continue; }
			const address = server.address();
			if (address && typeof address !== "string") this.port = address.port;
			this.servers.push(server);
		}
		this.keepAlive = setInterval(() => {
			for (const socket of this.sockets.clients) {
				if ((socket as WebSocket & { alive?: boolean }).alive === false) { socket.terminate(); continue; }
				(socket as WebSocket & { alive?: boolean }).alive = false; socket.ping();
			}
		}, keepAliveMs);
		this.keepAlive.unref?.();
		return { port: this.port, listening: this.servers.length, errors };
	}
	get running() { return this.servers.length > 0; }

	private async handle(request: IncomingMessage, response: ServerResponse) {
		const url = new URL(request.url ?? "/", "http://phone.invalid");
		if (request.method === "GET" && url.pathname === "/v1/phone/health") return json(response, 200, { ok: true, desktopId: this.ports.desktopId() });
		if (url.pathname === "/pair") {
			if (request.method !== "POST") return json(response, 405, { error: "Use POST." });
			let body: unknown;
			try { body = JSON.parse(await readBody(request, 16_384)); } catch { return json(response, 400, { error: "Invalid pairing request." }); }
			try {
				const { result } = this.ports.pairing.redeem(body);
				return json(response, 200, { ...result, desktopName: this.ports.desktopName() });
			} catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : "Pairing failed." }); }
		}
		json(response, 404, { error: "Not found." });
	}

	private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
		const url = new URL(request.url ?? "/", "http://phone.invalid"), header = request.headers.authorization ?? "";
		const device = url.pathname === "/v1/phone" && header.startsWith("Bearer ") ? this.ports.pairing.authenticate(header.slice(7)) : undefined;
		if (!device) { socket.end("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer\r\nConnection: close\r\n\r\n"); return; }
		this.sockets.handleUpgrade(request, socket, head, ws => {
			const session = this.ports.hub.open({ id: device.id, name: device.name }, frame => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame)); });
			this.ports.pairing.seen(device.id);
			// A removed phone's sockets close at once.
			session.whenClosed(() => { if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(4401, "Signed out"); });
			(ws as WebSocket & { alive?: boolean }).alive = true;
			ws.on("pong", () => { (ws as WebSocket & { alive?: boolean }).alive = true; });
			ws.on("message", (data, binary) => {
				if (binary) { ws.close(1003, "Text frames only"); return; }
				this.ports.pairing.seen(device.id);
				void session.receive(data.toString());
			});
			ws.on("close", () => session.close());
			ws.on("error", () => ws.terminate());
		});
	}

	async close() {
		clearInterval(this.keepAlive);
		for (const socket of this.sockets.clients) socket.terminate();
		const servers = this.servers; this.servers = [];
		await Promise.all(servers.map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
	}
}
