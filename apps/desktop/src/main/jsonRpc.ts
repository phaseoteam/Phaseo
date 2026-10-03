import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

type RpcPacket = { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string; data?: unknown } };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class JsonRpcResponseError extends Error {
	constructor(message: string, readonly code: number, readonly data?: unknown) { super(message); this.name = "JsonRpcResponseError"; }
}

/** Newline-delimited transport used by native agent app servers. */
export class JsonRpc {
	private buffer = "";
	private sequence = 0;
	private readonly pending = new Map<number, Pending>();
	private closed = false;
	private readonly decoder = new StringDecoder("utf8");
	private readonly dataListener = (chunk: Buffer | string) => this.receive(typeof chunk === "string" ? chunk : this.decoder.write(chunk));
	private readonly endListener = () => this.close(new Error("Agent connection closed."));
	onNotification: (method: string, params: unknown) => void = () => {};
	onClose: (error: Error) => void = () => {};
	onRequest: (method: string, params: unknown) => Promise<unknown> = async () => { throw new Error("Unsupported agent request."); };
	constructor(private readonly input: Readable, private readonly output: Writable) {
		input.on("data", this.dataListener); input.on("end", this.endListener);
		input.on("error", this.endListener); output.on("error", this.endListener);
	}
	request<T = unknown>(method: string, params: unknown, timeoutMs = 30000): Promise<T> {
		if (this.closed) return Promise.reject(new Error("Agent connection is closed."));
		const id = ++this.sequence;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Agent request timed out: ${method}`)); }, timeoutMs);
			this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
			try { this.write({ id, method, params }); } catch (error) { this.close(error instanceof Error ? error : new Error("Agent write failed.")); }
		});
	}
	notify(method: string, params?: unknown) { this.write({ method, params }); }
	private write(packet: RpcPacket) {
		if (this.closed) throw new Error("Agent connection is closed.");
		this.output.write(`${JSON.stringify(packet)}\n`);
	}
	private receive(chunk: string) {
		this.buffer += chunk;
		if (this.buffer.length > 16 * 1024 * 1024) { this.close(new Error("Agent packet exceeds the size limit.")); return; }
		let newline: number;
		while ((newline = this.buffer.indexOf("\n")) >= 0) {
			const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
			if (!line.trim()) continue;
			let packet: RpcPacket;
			try { packet = JSON.parse(line) as RpcPacket; }
			catch { this.close(new Error("Agent returned invalid JSON.")); return; }
			if (!packet || typeof packet !== "object") { this.close(new Error("Agent returned an invalid packet.")); return; }
			if (packet.method) {
				if (packet.id !== undefined) {
					const id = packet.id;
					const method = packet.method;
					void Promise.resolve().then(() => this.onRequest(method, packet.params)).then(result => {
						if (!this.closed) this.write({ id, result });
					}, error => {
						if (!this.closed) this.write({ id, error: { code: -32601, message: error instanceof Error ? error.message : "Agent request failed." } });
					}).catch(error => this.close(error instanceof Error ? error : new Error("Agent response failed.")));
				} else {
					try { this.onNotification(packet.method, packet.params); }
					catch (error) { this.close(error instanceof Error ? error : new Error("Agent notification failed.")); return; }
				}
			} else if (typeof packet.id === "number") {
				const pending = this.pending.get(packet.id);
				if (!pending) continue;
				clearTimeout(pending.timer); this.pending.delete(packet.id);
				if (packet.error) pending.reject(new JsonRpcResponseError(packet.error.message, packet.error.code, packet.error.data)); else pending.resolve(packet.result);
			}
		}
	}
	close(error = new Error("Agent connection closed.")) {
		if (this.closed) return;
		this.closed = true;
		this.input.off("data", this.dataListener); this.input.off("end", this.endListener);
		this.input.off("error", this.endListener); this.output.off("error", this.endListener);
		for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
		this.pending.clear();
		this.onClose(error);
	}
}
