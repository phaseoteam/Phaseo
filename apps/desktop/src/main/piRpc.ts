import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export type PiRecord = Record<string, unknown>;
export class PiRpc {
	private readonly decoder = new StringDecoder("utf8");
	private buffer = "";
	private sequence = 0;
	private closed = false;
	private readonly pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> }>();
	onEvent: (record: PiRecord) => void = () => {};
	onClose: (error: Error) => void = () => {};
	constructor(input: Readable, private readonly output: Writable) {
		input.on("data", chunk => {
			if (this.closed) return;
			this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
			let newline: number;
			while ((newline = this.buffer.indexOf("\n")) !== -1) {
				const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
				if (line.length > 8 * 1024 * 1024) { this.close(new Error("Pi packet exceeds the size limit.")); return; }
				if (!line.trim()) continue;
				try {
					const record = JSON.parse(line) as PiRecord;
					if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Invalid Pi record.");
					const pending = typeof record.id === "string" && record.type === "response" ? this.pending.get(record.id) : undefined;
					if (pending) { this.pending.delete(record.id as string); clearTimeout(pending.timer); if (record.success === true) pending.resolve(record.data); else pending.reject(new Error(typeof record.error === "string" ? record.error : "Pi command failed.")); }
					else this.onEvent(record);
				} catch (error) { this.close(error instanceof Error ? error : new Error("Invalid Pi record.")); return; }
			}
			if (this.buffer.length > 8 * 1024 * 1024) this.close(new Error("Pi packet exceeds the size limit."));
		});
		input.on("end", () => this.close(new Error("Pi connection ended.")));
		input.on("error", error => this.close(error)); output.on("error", error => this.close(error));
	}
	send(record: PiRecord) {
		if (this.closed) throw new Error("Pi connection is closed.");
		this.output.write(`${JSON.stringify(record)}\n`);
	}
	request<T = unknown>(command: PiRecord, timeoutMs = 30000): Promise<T> {
		if (this.closed) return Promise.reject(new Error("Pi connection is closed."));
		const id = `phaseo-${++this.sequence}`;
		return new Promise<T>((resolve, reject) => {
			const timer = timeoutMs > 0 ? setTimeout(() => { this.pending.delete(id); reject(new Error(`Pi request timed out: ${command.type}`)); }, timeoutMs) : undefined;
			this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
			try { this.send({ ...command, id }); } catch (error) { this.close(error instanceof Error ? error : new Error("Pi write failed.")); }
		});
	}
	close(error = new Error("Pi connection closed.")) {
		if (this.closed) return; this.closed = true;
		for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
		this.pending.clear(); this.onClose(error);
	}
}
