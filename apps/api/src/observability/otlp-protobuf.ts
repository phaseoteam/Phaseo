// Generated from packages/shared/broadcast-destinations/otlp-protobuf.ts by scripts/sync-broadcast-destinations.mjs. Do not edit.
// Encodes OTLP/JSON trace exports as OTLP/HTTP protobuf, for collectors that
// do not accept JSON. Covers the whole ExportTraceServiceRequest message set in
// opentelemetry-proto v1 (trace, common and resource), without a protobuf
// runtime: field numbers below come from those .proto files.

type Json = Record<string, unknown>;

class Writer {
	private chunks: Uint8Array[] = [];
	private length = 0;

	private push(bytes: Uint8Array) {
		this.chunks.push(bytes);
		this.length += bytes.length;
	}

	private tag(field: number, wire: number) {
		this.varint(BigInt((field << 3) | wire));
	}

	varint(value: bigint) {
		// int64 negatives are encoded as their 64-bit two's complement.
		let rest = BigInt.asUintN(64, value);
		const bytes: number[] = [];
		do {
			const byte = Number(rest & 0x7fn);
			rest >>= 7n;
			bytes.push(rest ? byte | 0x80 : byte);
		} while (rest);
		this.push(Uint8Array.from(bytes));
	}

	uint(field: number, value: unknown) {
		const parsed = integer(value);
		if (parsed) {
			this.tag(field, 0);
			this.varint(parsed);
		}
	}

	fixed64(field: number, value: unknown) {
		const parsed = integer(value);
		if (!parsed) return;
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, parsed), true);
		this.tag(field, 1);
		this.push(bytes);
	}

	fixed32(field: number, value: unknown) {
		const parsed = integer(value);
		if (!parsed) return;
		const bytes = new Uint8Array(4);
		new DataView(bytes.buffer).setUint32(0, Number(BigInt.asUintN(32, parsed)), true);
		this.tag(field, 5);
		this.push(bytes);
	}

	double(field: number, value: number) {
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setFloat64(0, value, true);
		this.tag(field, 1);
		this.push(bytes);
	}

	bytes(field: number, value: Uint8Array, always = false) {
		if (!value.length && !always) return;
		this.tag(field, 2);
		this.varint(BigInt(value.length));
		this.push(value);
	}

	string(field: number, value: unknown, always = false) {
		if (typeof value !== "string") return;
		this.bytes(field, new TextEncoder().encode(value), always);
	}

	message(field: number, encode: (writer: Writer) => void) {
		const nested = new Writer();
		encode(nested);
		this.bytes(field, nested.finish(), true);
	}

	finish(): Uint8Array<ArrayBuffer> {
		const output = new Uint8Array(this.length);
		let offset = 0;
		for (const chunk of this.chunks) {
			output.set(chunk, offset);
			offset += chunk.length;
		}
		return output;
	}
}

function object(value: unknown): Json {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function integer(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
	if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
	return 0n;
}

function hex(value: unknown): Uint8Array {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text || text.length % 2 || !/^[0-9a-f]+$/i.test(text)) return new Uint8Array();
	return Uint8Array.from(text.match(/../g)!.map((pair) => parseInt(pair, 16)));
}

function base64(value: unknown): Uint8Array {
	try {
		return Uint8Array.from(atob(String(value ?? "")), (char) => char.charCodeAt(0));
	} catch {
		return new Uint8Array();
	}
}

const SPAN_KINDS: Record<string, number> = {
	SPAN_KIND_UNSPECIFIED: 0, SPAN_KIND_INTERNAL: 1, SPAN_KIND_SERVER: 2, SPAN_KIND_CLIENT: 3, SPAN_KIND_PRODUCER: 4, SPAN_KIND_CONSUMER: 5,
};
const STATUS_CODES: Record<string, number> = { STATUS_CODE_UNSET: 0, STATUS_CODE_OK: 1, STATUS_CODE_ERROR: 2 };

function enumValue(value: unknown, names: Record<string, number>): number {
	return typeof value === "string" && value in names ? names[value] : Number(integer(value));
}

// AnyValue is a oneof, so a set member is written even when it holds a default.
function anyValue(writer: Writer, value: Json) {
	if ("stringValue" in value) writer.string(1, String(value.stringValue ?? ""), true);
	else if ("boolValue" in value) {
		writer.varint(BigInt((2 << 3) | 0));
		writer.varint(value.boolValue === true ? 1n : 0n);
	} else if ("intValue" in value) {
		writer.varint(BigInt((3 << 3) | 0));
		writer.varint(integer(value.intValue));
	} else if ("doubleValue" in value) writer.double(4, Number(value.doubleValue));
	else if ("arrayValue" in value) {
		writer.message(5, (array) => {
			for (const item of list(object(value.arrayValue).values)) array.message(1, (entry) => anyValue(entry, object(item)));
		});
	} else if ("kvlistValue" in value) {
		writer.message(6, (kvlist) => attributes(kvlist, 1, object(value.kvlistValue).values));
	} else if ("bytesValue" in value) writer.bytes(7, base64(value.bytesValue), true);
}

function attributes(writer: Writer, field: number, values: unknown) {
	for (const item of list(values)) {
		const attribute = object(item);
		writer.message(field, (keyValue) => {
			keyValue.string(1, attribute.key);
			if (attribute.value !== undefined) keyValue.message(2, (entry) => anyValue(entry, object(attribute.value)));
		});
	}
}

function span(writer: Writer, value: Json) {
	writer.bytes(1, hex(value.traceId));
	writer.bytes(2, hex(value.spanId));
	writer.string(3, value.traceState);
	writer.bytes(4, hex(value.parentSpanId));
	writer.string(5, value.name);
	writer.uint(6, enumValue(value.kind, SPAN_KINDS));
	writer.fixed64(7, value.startTimeUnixNano);
	writer.fixed64(8, value.endTimeUnixNano);
	attributes(writer, 9, value.attributes);
	writer.uint(10, value.droppedAttributesCount);
	for (const item of list(value.events)) {
		const event = object(item);
		writer.message(11, (entry) => {
			entry.fixed64(1, event.timeUnixNano);
			entry.string(2, event.name);
			attributes(entry, 3, event.attributes);
			entry.uint(4, event.droppedAttributesCount);
		});
	}
	writer.uint(12, value.droppedEventsCount);
	for (const item of list(value.links)) {
		const link = object(item);
		writer.message(13, (entry) => {
			entry.bytes(1, hex(link.traceId));
			entry.bytes(2, hex(link.spanId));
			entry.string(3, link.traceState);
			attributes(entry, 4, link.attributes);
			entry.uint(5, link.droppedAttributesCount);
			entry.fixed32(6, link.flags);
		});
	}
	writer.uint(14, value.droppedLinksCount);
	if (value.status !== undefined) {
		const status = object(value.status);
		writer.message(15, (entry) => {
			entry.string(2, status.message);
			entry.uint(3, enumValue(status.code, STATUS_CODES));
		});
	}
	writer.fixed32(16, value.flags);
}

// Encodes an OTLP/JSON ExportTraceServiceRequest ({ resourceSpans: [...] }).
export function encodeOtlpTraceRequest(payload: unknown): Uint8Array<ArrayBuffer> {
	const writer = new Writer();
	for (const item of list(object(payload).resourceSpans)) {
		const resourceSpans = object(item);
		writer.message(1, (entry) => {
			if (resourceSpans.resource !== undefined) {
				const resource = object(resourceSpans.resource);
				entry.message(1, (encoded) => {
					attributes(encoded, 1, resource.attributes);
					encoded.uint(2, resource.droppedAttributesCount);
				});
			}
			for (const scopeItem of list(resourceSpans.scopeSpans)) {
				const scopeSpans = object(scopeItem);
				entry.message(2, (encodedScopeSpans) => {
					if (scopeSpans.scope !== undefined) {
						const scope = object(scopeSpans.scope);
						encodedScopeSpans.message(1, (encoded) => {
							encoded.string(1, scope.name);
							encoded.string(2, scope.version);
							attributes(encoded, 3, scope.attributes);
							encoded.uint(4, scope.droppedAttributesCount);
						});
					}
					for (const spanItem of list(scopeSpans.spans)) encodedScopeSpans.message(2, (encoded) => span(encoded, object(spanItem)));
					encodedScopeSpans.string(3, scopeSpans.schemaUrl);
				});
			}
			entry.string(3, resourceSpans.schemaUrl);
		});
	}
	return writer.finish();
}

// Reads ExportTraceServiceResponse.partial_success; other fields are skipped.
export function decodeOtlpTraceResponse(bytes: Uint8Array): { rejectedSpans: number; errorMessage: string } {
	const result = { rejectedSpans: 0, errorMessage: "" };
	const readMessage = (start: number, end: number, onField: (field: number, wire: number, at: number, next: number) => void) => {
		let offset = start;
		const varint = (): bigint => {
			let value = 0n;
			let shift = 0n;
			for (;;) {
				if (offset >= end) throw new Error("truncated");
				const byte = bytes[offset++];
				value |= BigInt(byte & 0x7f) << shift;
				if (!(byte & 0x80)) return value;
				shift += 7n;
			}
		};
		while (offset < end) {
			const key = Number(varint());
			const field = key >> 3;
			const wire = key & 7;
			const at = offset;
			let next: number;
			if (wire === 0) {
				varint();
				next = offset;
			} else if (wire === 1) next = offset + 8;
			else if (wire === 2) {
				const length = Number(varint());
				next = offset + length;
			} else if (wire === 5) next = offset + 4;
			else throw new Error("unsupported wire type");
			if (next > end) throw new Error("truncated");
			onField(field, wire, wire === 2 ? offset : at, next);
			offset = next;
		}
	};
	try {
		readMessage(0, bytes.length, (field, wire, at, next) => {
			if (field !== 1 || wire !== 2) return;
			readMessage(at, next, (inner, innerWire, innerAt, innerNext) => {
				if (inner === 1 && innerWire === 0) {
					let value = 0n;
					let shift = 0n;
					for (let index = innerAt; index < innerNext; index++) {
						value |= BigInt(bytes[index] & 0x7f) << shift;
						shift += 7n;
					}
					result.rejectedSpans = Number(BigInt.asIntN(64, value));
				}
				if (inner === 2 && innerWire === 2) result.errorMessage = new TextDecoder().decode(bytes.subarray(innerAt, innerNext));
			});
		});
	} catch {
		return { rejectedSpans: 0, errorMessage: "" };
	}
	return result;
}
