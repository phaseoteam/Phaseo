// Phaseo Connect: one ConnectRoom per paired desktop relays end-to-end
// encrypted envelopes between the desktop and its phones. The relay sees only
// routing fields (to, from, seq, nonce, hold) and opaque ciphertext, and never
// logs either. Sockets use the Hibernation API so an idle room costs nothing,
// and ping/pong is answered by the runtime without waking it.
//
// Wire protocol (JSON text frames):
// - Envelope, either way: { to, seq, nonce, ciphertext, hold? }. `to` is a
//   deviceId from the desktop and "desktop" from a phone; the relay adds `from`.
//   `hold: true` keeps it for an offline recipient (attention, send, answer_*);
//   anything else is dropped while the other side is away.
// - Desktop only: { id?, type: "register_device", deviceId, relayTokenHash }
//   (hex SHA-256 of the phone's relay token) and { id?, type: "remove_device",
//   deviceId }; replies { id, ok } or { id, ok: false, error }.
// - From the relay: desktop_online / desktop_offline to phones;
//   devices_online { deviceIds } / device_online / device_offline { deviceId }
//   to the desktop; { type: "error", error, seq? }.
// - { "type": "ping" } is answered with { "type": "pong" }.

export type ConnectEnv = {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
};

type Role = "desktop" | "phone";
type Attachment = { role: Role; deviceId?: string };
export type ConnectEntitlement = { enabled: boolean; paidUp: boolean };

export const CONNECT_ROLE_HEADER = "x-connect-role";
export const CONNECT_WORKSPACE_HEADER = "x-connect-workspace";
export const CONNECT_KEY_HASH_HEADER = "x-connect-key-hash";

export const HOLD_MAX_MESSAGES = 500;
export const HOLD_MAX_BYTES = 5 * 1024 * 1024;
export const HOLD_TTL_MS = 24 * 60 * 60 * 1000;
export const ENTITLEMENT_TTL_MS = 5 * 60 * 1000;
// A 1 MiB frame grows by a third as base64 ciphertext, plus the envelope fields.
export const MAX_MESSAGE_CHARS = 1_500_000;
const MAX_DEVICES = 20;
// Per socket: a phone sends at most 50 requests a second; the desktop serves up to 20 phones.
const MESSAGES_PER_SECOND = { phone: 100, desktop: 500 } as const;
const DESKTOP = "desktop";
const OPEN = 1;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const TOKEN_HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

// Close codes the desktop and phone act on.
export const CLOSE_REPLACED = 4000;
export const CLOSE_DEVICE_REMOVED = 4001;
export const CLOSE_NOT_ENTITLED = 4402;

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Asks the database whether the workspace may use Connect (get_connect_entitlement). Null when it can't be read. */
export async function fetchConnectEntitlement(env: ConnectEnv, workspaceId: string, fetcher: typeof fetch = fetch): Promise<ConnectEntitlement | null> {
	try {
		const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/get_connect_entitlement`, {
			method: "POST",
			headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
			body: JSON.stringify({ p_workspace_id: workspaceId }),
		});
		if (!response.ok) return null;
		const body = await response.json() as unknown;
		const row = (Array.isArray(body) ? body[0] : body) as { enabled?: unknown; paid_up?: unknown } | undefined;
		if (!row || typeof row.enabled !== "boolean" || typeof row.paid_up !== "boolean") return null;
		return { enabled: row.enabled, paidUp: row.paid_up };
	} catch {
		return null;
	}
}

const json = (status: number, error: string) =>
	new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export class ConnectRoom {
	private readonly sql: SqlStorage;
	private readonly rate = new WeakMap<WebSocket, { second: number; count: number }>();

	constructor(private readonly ctx: DurableObjectState, private readonly env: ConnectEnv) {
		this.sql = ctx.storage.sql;
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS held (
				id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, recipient TEXT NOT NULL,
				body TEXT NOT NULL, bytes INTEGER NOT NULL, expires_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS held_recipient ON held (recipient, id);
			CREATE INDEX IF NOT EXISTS held_device ON held (device_id, id);
		`);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
	}

	async fetch(request: Request): Promise<Response> {
		const role = request.headers.get(CONNECT_ROLE_HEADER);
		if (role === "desktop") return this.connectDesktop(request);
		if (role === "phone") return this.connectPhone(request);
		return json(404, "not_found");
	}

	private async connectDesktop(request: Request): Promise<Response> {
		const workspaceId = request.headers.get(CONNECT_WORKSPACE_HEADER) ?? "";
		const keyHash = request.headers.get(CONNECT_KEY_HASH_HEADER) ?? "";
		if (!workspaceId || !keyHash) return json(400, "bad_request");
		// The room belongs to the workspace that first connected it; another workspace's key can't take it over.
		const pinned = this.meta("workspace_id");
		if (pinned && pinned !== workspaceId) return json(403, "workspace_mismatch");
		const entitlement = await this.entitlement(workspaceId);
		if (!entitlement) return json(503, "entitlement_unavailable");
		if (!entitlement.enabled) return json(403, "connect_off");
		if (!entitlement.paidUp) return json(402, "payment_required");
		if (!pinned) this.setMeta("workspace_id", workspaceId);
		this.setMeta("key_hash", keyHash);

		for (const old of this.open(DESKTOP)) old.close(CLOSE_REPLACED, "replaced");
		const { response, socket } = this.upgrade({ role: "desktop" }, [DESKTOP]);
		this.send(socket, { type: "devices_online", deviceIds: this.onlineDevices() });
		this.deliverHeld(socket, DESKTOP);
		for (const phone of this.open("phone")) this.send(phone, { type: "desktop_online" });
		return response;
	}

	private async connectPhone(request: Request): Promise<Response> {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
		if (!token) return json(401, "unauthorized");
		const tokenHash = await sha256Hex(token);
		const device = this.sql.exec<{ device_id: string }>("SELECT device_id FROM devices WHERE token_hash = ?", tokenHash).toArray()[0];
		if (!device) return json(401, "unauthorized");
		const workspaceId = this.meta("workspace_id");
		if (!workspaceId) return json(401, "unauthorized");
		const entitlement = await this.entitlement(workspaceId);
		if (!entitlement) return json(503, "entitlement_unavailable");
		if (!entitlement.enabled || !entitlement.paidUp) return json(402, "connect_unavailable");

		const tag = `device:${device.device_id}`;
		for (const old of this.open(tag)) old.close(CLOSE_REPLACED, "replaced");
		const { response, socket } = this.upgrade({ role: "phone", deviceId: device.device_id }, ["phone", tag]);
		const desktop = this.desktop();
		this.send(socket, { type: desktop ? "desktop_online" : "desktop_offline" });
		this.deliverHeld(socket, device.device_id);
		if (desktop) this.send(desktop, { type: "device_online", deviceId: device.device_id });
		return response;
	}

	/** Accepts the server end with hibernation and returns the 101 response. Overridden in tests (no WebSocketPair in Node). */
	protected upgrade(attachment: Attachment, tags: string[]): { response: Response; socket: WebSocket } {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server, tags);
		server.serializeAttachment(attachment);
		return { response: new Response(null, { status: 101, webSocket: client }), socket: server };
	}

	async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const attachment = socket.deserializeAttachment() as Attachment | null;
		if (!attachment) return socket.close(1011, "unknown_socket");
		if (typeof message !== "string") return this.send(socket, { type: "error", error: "text_only" });
		if (message.length > MAX_MESSAGE_CHARS) return this.send(socket, { type: "error", error: "too_large" });
		if (!this.allow(socket, attachment.role)) return this.send(socket, { type: "error", error: "rate_limited" });
		if (!(await this.stillEntitled())) return;

		let frame: Record<string, unknown>;
		try {
			const parsed = JSON.parse(message) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
			frame = parsed as Record<string, unknown>;
		} catch {
			return this.send(socket, { type: "error", error: "invalid_json" });
		}

		if (attachment.role === "desktop" && typeof frame.type === "string") return this.control(socket, frame);
		return this.route(socket, attachment, frame);
	}

	async webSocketClose(socket: WebSocket): Promise<void> {
		this.gone(socket);
	}

	async webSocketError(socket: WebSocket): Promise<void> {
		this.gone(socket);
	}

	/** Drops held envelopes that have waited 24 hours, then waits for the next one to expire. */
	async alarm(): Promise<void> {
		this.sql.exec("DELETE FROM held WHERE expires_at <= ?", Date.now());
		const next = this.sql.exec<{ next: number | null }>("SELECT MIN(expires_at) AS next FROM held").one().next;
		if (next !== null) await this.ctx.storage.setAlarm(next);
	}

	private control(socket: WebSocket, frame: Record<string, unknown>) {
		const id = typeof frame.id === "string" || typeof frame.id === "number" ? frame.id : undefined;
		const reply = (error?: string) => this.send(socket, error ? { id, ok: false, error } : { id, ok: true });
		const deviceId = typeof frame.deviceId === "string" && DEVICE_ID.test(frame.deviceId) ? frame.deviceId : null;
		if (frame.type === "register_device") {
			const hash = typeof frame.relayTokenHash === "string" ? frame.relayTokenHash.toLowerCase() : "";
			if (!deviceId || !TOKEN_HASH.test(hash)) return reply("invalid_device");
			const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE device_id <> ?", deviceId).one().n;
			if (count >= MAX_DEVICES) return reply("too_many_devices");
			const taken = this.sql.exec<{ device_id: string }>("SELECT device_id FROM devices WHERE token_hash = ?", hash).toArray()[0];
			if (taken && taken.device_id !== deviceId) return reply("token_in_use");
			// Re-registering a device rotates its token and ends any session on the old one.
			this.sql.exec(
				"INSERT INTO devices (device_id, token_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (device_id) DO UPDATE SET token_hash = excluded.token_hash",
				deviceId, hash, Date.now(),
			);
			if (!taken) for (const old of this.open(`device:${deviceId}`)) old.close(CLOSE_DEVICE_REMOVED, "token_rotated");
			return reply();
		}
		if (frame.type === "remove_device") {
			if (!deviceId) return reply("invalid_device");
			this.sql.exec("DELETE FROM devices WHERE device_id = ?", deviceId);
			this.sql.exec("DELETE FROM held WHERE device_id = ?", deviceId);
			for (const phone of this.open(`device:${deviceId}`)) phone.close(CLOSE_DEVICE_REMOVED, "device_removed");
			return reply();
		}
		return reply("unknown_type");
	}

	private async route(socket: WebSocket, attachment: Attachment, frame: Record<string, unknown>) {
		const { to, seq, nonce, ciphertext, hold } = frame;
		if (typeof to !== "string" || !Number.isSafeInteger(seq) || (seq as number) < 0 || typeof nonce !== "string" || !NONCE.test(nonce)
			|| typeof ciphertext !== "string" || !ciphertext || (hold !== undefined && typeof hold !== "boolean")) {
			return this.send(socket, { type: "error", error: "invalid_envelope", seq: Number.isSafeInteger(seq) ? seq : undefined });
		}
		// The relay sets `from` itself, so a phone can't pretend to be the desktop or another phone.
		let from: string;
		let deviceId: string;
		if (attachment.role === "phone") {
			if (to !== DESKTOP) return this.send(socket, { type: "error", error: "invalid_recipient", seq });
			from = deviceId = attachment.deviceId ?? "";
		} else {
			if (!this.sql.exec("SELECT 1 FROM devices WHERE device_id = ?", to).toArray().length) {
				return this.send(socket, { type: "error", error: "unknown_device", seq });
			}
			from = DESKTOP;
			deviceId = to;
		}
		const body = JSON.stringify({ to, from, seq, nonce, ciphertext });
		const recipient = to === DESKTOP ? this.desktop() : this.open(`device:${to}`)[0];
		if (recipient) {
			recipient.send(body);
			return;
		}
		// Live updates are dropped while the other side is away (the phone re-reads on reconnect);
		// envelopes marked hold wait for it.
		if (hold) await this.hold(deviceId, to, body);
	}

	private async hold(deviceId: string, recipient: string, body: string) {
		const expiresAt = Date.now() + HOLD_TTL_MS;
		this.sql.exec("INSERT INTO held (device_id, recipient, body, bytes, expires_at) VALUES (?, ?, ?, ?, ?)", deviceId, recipient, body, body.length, expiresAt);
		// Oldest first out once the device is over 500 envelopes or 5 MB.
		this.sql.exec(
			`DELETE FROM held WHERE id IN (
				SELECT id FROM (
					SELECT id, SUM(bytes) OVER (ORDER BY id DESC) AS running, ROW_NUMBER() OVER (ORDER BY id DESC) AS n
					FROM held WHERE device_id = ?
				) WHERE running > ? OR n > ?
			)`,
			deviceId, HOLD_MAX_BYTES, HOLD_MAX_MESSAGES,
		);
		if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(expiresAt);
	}

	private deliverHeld(socket: WebSocket, recipient: string) {
		const rows = this.sql.exec<{ id: number; body: string }>(
			"SELECT id, body FROM held WHERE recipient = ? AND expires_at > ? ORDER BY id", recipient, Date.now(),
		).toArray();
		for (const row of rows) socket.send(row.body);
		if (rows.length) this.sql.exec("DELETE FROM held WHERE recipient = ? AND id <= ?", recipient, rows[rows.length - 1].id);
	}

	/** Re-reads the entitlement every 5 minutes of activity; a room that lost it closes every socket. */
	private async stillEntitled(): Promise<boolean> {
		const workspaceId = this.meta("workspace_id");
		if (!workspaceId) return false;
		const entitlement = await this.entitlement(workspaceId);
		// A failed read keeps live sessions going; the next message retries.
		if (!entitlement || (entitlement.enabled && entitlement.paidUp)) return true;
		const reason = entitlement.enabled ? "payment_required" : "connect_off";
		for (const socket of this.open()) socket.close(CLOSE_NOT_ENTITLED, reason);
		return false;
	}

	private async entitlement(workspaceId: string): Promise<ConnectEntitlement | null> {
		const cached = this.meta("entitlement");
		if (cached) {
			const parsed = JSON.parse(cached) as ConnectEntitlement & { workspaceId: string; checkedAt: number };
			if (parsed.workspaceId === workspaceId && Date.now() - parsed.checkedAt < ENTITLEMENT_TTL_MS) return { enabled: parsed.enabled, paidUp: parsed.paidUp };
		}
		const fresh = await fetchConnectEntitlement(this.env, workspaceId);
		if (fresh) this.setMeta("entitlement", JSON.stringify({ ...fresh, workspaceId, checkedAt: Date.now() }));
		return fresh;
	}

	private gone(socket: WebSocket) {
		const attachment = socket.deserializeAttachment() as Attachment | null;
		if (attachment?.role === "phone" && attachment.deviceId) {
			const desktop = this.desktop();
			if (desktop && !this.open(`device:${attachment.deviceId}`).some((other) => other !== socket)) {
				this.send(desktop, { type: "device_offline", deviceId: attachment.deviceId });
			}
		} else if (attachment?.role === "desktop" && !this.open(DESKTOP).some((other) => other !== socket)) {
			for (const phone of this.open("phone")) this.send(phone, { type: "desktop_offline" });
		}
	}

	private allow(socket: WebSocket, role: Role) {
		const second = Math.floor(Date.now() / 1000);
		const current = this.rate.get(socket);
		if (!current || current.second !== second) {
			this.rate.set(socket, { second, count: 1 });
			return true;
		}
		current.count += 1;
		return current.count <= MESSAGES_PER_SECOND[role];
	}

	/** Sockets still open: ones being replaced or removed stay listed until their close completes. */
	private open(tag?: string) {
		return this.ctx.getWebSockets(tag).filter((socket) => socket.readyState === OPEN);
	}

	private desktop() {
		return this.open(DESKTOP)[0];
	}

	private onlineDevices() {
		return this.open("phone")
			.map((socket) => (socket.deserializeAttachment() as Attachment | null)?.deviceId)
			.filter((id): id is string => Boolean(id));
	}

	private send(socket: WebSocket, frame: Record<string, unknown>) {
		try {
			socket.send(JSON.stringify(frame));
		} catch {
			// The socket closed under us; its close handler tidies up.
		}
	}

	private meta(key: string): string | null {
		return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value ?? null;
	}

	private setMeta(key: string, value: string) {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
	}
}
