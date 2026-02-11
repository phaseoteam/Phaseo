// file: lib/byok/decrypt.ts
// Purpose: BYOK helpers for decrypting and managing user-provided keys.
// Why: Keeps key handling isolated and secure.
// How: Exposes focused helpers for this module.

import { getByokKey } from "@/runtime/env";

const te = new TextEncoder();
const td = new TextDecoder();

/* ----------------------------- utils: decoding ----------------------------- */

function normaliseB64(s: string) {
    // strip quotes and optional "base64:" prefix
    let t = s.trim().replace(/^["']|["']$/g, "");
    if (t.startsWith("base64:")) t = t.slice(7);
    // url-safe -> std
    t = t.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (t.length % 4) t += "=";
    return t;
}

function b64ToBytes(s: string): Uint8Array {
    const std = normaliseB64(s);
    const bin = atob(std);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function hexToBytes(hex: string): Uint8Array {
    const h = hex.startsWith("\\x") ? hex.slice(2) : hex.startsWith("0x") ? hex.slice(2) : hex;
    if (h.length % 2 !== 0) throw new Error(`Invalid hex length: ${h.length}`);
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = parseInt(h.substr(i * 2, 2), 16);
        if (Number.isNaN(byte)) throw new Error(`Invalid hex at index ${i}`);
        out[i] = byte;
    }
    return out;
}

function tryParseBufferJson(s: string): Uint8Array | null {
    // Detect Node Buffer JSON: {"type":"Buffer","data":[...]}
    if (!s || s[0] !== "{") return null;
    try {
        const obj = JSON.parse(s);
        if (obj && obj.type === "Buffer" && Array.isArray(obj.data)) {
            return new Uint8Array(obj.data);
        }
    } catch { }
    return null;
}

function cloneUint8(view: ArrayBufferView | Uint8Array): Uint8Array {
    if (view instanceof Uint8Array) {
        return new Uint8Array(view);
    }
    const base = new Uint8Array(view.buffer as ArrayBufferLike, view.byteOffset, view.byteLength);
    return new Uint8Array(base);
}

function looksAscii(u8: Uint8Array): boolean {
    for (let i = 0; i < u8.length; i++) {
        const b = u8[i];
        // permit printable ASCII + whitespace we can safely trim
        if (b === 0x09 || b === 0x0a || b === 0x0d || b === 0x20) continue;
        if (b < 0x21 || b > 0x7e) return false;
    }
    return true;
}

function decodeAsciiBytes(u8: Uint8Array): Uint8Array | null {
    if (!u8.length || !looksAscii(u8)) return null;
    try {
        const asString = td.decode(u8).trim();
        if (!asString) return new Uint8Array();
        return parseStringBytes(asString);
    } catch {
        return null;
    }
}

function parseBufferLikeObject(obj: Record<string, unknown>): Uint8Array | null {
    if (!obj) return null;
    const asAny = obj as any;
    if (Array.isArray(asAny)) {
        if (asAny.every((v) => typeof v === "number")) return new Uint8Array(asAny);
        return null;
    }
    if (Array.isArray(asAny.data) && asAny.data.every((v: unknown) => typeof v === "number")) {
        return new Uint8Array(asAny.data);
    }
    if (asAny.type === "Buffer" && Array.isArray(asAny.data)) {
        return new Uint8Array(asAny.data);
    }
    return null;
}

function parseStringBytes(value: string): Uint8Array {
    const s = value.trim();
    if (!s) return new Uint8Array();

    const bufJson = tryParseBufferJson(s);
    if (bufJson) return bufJson;

    if (/^\\x[0-9a-fA-F]+$/.test(s) || /^0x[0-9a-fA-F]+$/.test(s)) {
        const raw = hexToBytes(s);
        // Some rows stored ASCII base64 inside bytea hex form; try decoding further.
        return decodeAsciiBytes(raw) ?? raw;
    }

    // Supabase / PostgREST return base64 for bytea columns; try decode
    try {
        return b64ToBytes(s);
    } catch { }

    // Possibly a numeric array encoded as JSON or PG-style {1,2,3}
    const numericArrayMatch = s.match(/^\{?(\s*\d+\s*(?:,\s*\d+\s*)*)\}?$/);
    if (numericArrayMatch) {
        const nums = numericArrayMatch[1].split(",").map((n) => Number(n.trim()));
        if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
            return new Uint8Array(nums);
        }
    }

    throw new Error(`Unable to decode BYOK field from string (${s.slice(0, 48)}${s.length > 48 ? "..." : ""})`);
}

function isArrayBufferLike(value: unknown): value is ArrayBufferLike {
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
    if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) return true;
    return false;
}

function toBytesUnknown(x: unknown): Uint8Array {
    if (x instanceof Uint8Array) {
        const copy = new Uint8Array(x);
        return decodeAsciiBytes(copy) ?? copy;
    }

    if (isArrayBufferLike(x)) {
        const view = new Uint8Array(x);
        return decodeAsciiBytes(view) ?? new Uint8Array(view);
    }

    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(x)) {
        const cloned = cloneUint8(x as ArrayBufferView);
        return decodeAsciiBytes(cloned) ?? cloned;
    }

    if (Array.isArray(x)) {
        const arr = new Uint8Array(x);
        return decodeAsciiBytes(arr) ?? arr;
    }

    if (x && typeof x === "object") {
        const parsed = parseBufferLikeObject(x as Record<string, unknown>);
        if (parsed) return decodeAsciiBytes(parsed) ?? parsed;
        // Fall through to stringification
    }

    if (typeof x === "string") {
        return parseStringBytes(x);
    }

    if (x === null || x === undefined) {
        throw new Error("Unable to decode BYOK field: value is null/undefined");
    }

    return parseStringBytes(String(x));
}

function previewBytes(u8: Uint8Array, limit = 16): string {
    const slice = u8.slice(0, limit);
    return Array.from(slice)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
}

function summarizeValue(value: unknown) {
    const summary: Record<string, unknown> = { type: typeof value };
    if (value && typeof value === "object" && (value as any).constructor) {
        summary.ctor = (value as any).constructor.name;
    }
    if (typeof value === "string") {
        summary.length = value.length;
        summary.preview = value.length > 64 ? `${value.slice(0, 61)}...` : value;
    } else if (value instanceof Uint8Array) {
        summary.length = value.length;
        summary.preview = previewBytes(value);
    } else if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
        summary.length = value.byteLength;
        summary.ctor = "ArrayBuffer";
    } else if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        summary.length = view.byteLength;
        summary.ctor = view.constructor?.name ?? "ArrayBufferView";
    } else if (Array.isArray(value)) {
        summary.length = value.length;
        summary.preview = value.slice(0, 8);
    }
    return summary;
}
function viewToArrayBuffer(u8: Uint8Array): ArrayBuffer {
    // SubtleCrypto likes ArrayBuffer or exact-view window; ensure we hand it a detached ArrayBuffer.
    const buf = u8.buffer;
    if (typeof SharedArrayBuffer !== "undefined" && buf instanceof SharedArrayBuffer) {
        return u8.slice().buffer as ArrayBuffer;
    }
    if (u8.byteOffset === 0 && u8.byteLength === buf.byteLength && buf instanceof ArrayBuffer) {
        return buf;
    }
    return u8.slice().buffer as ArrayBuffer;
}

/* --------------------------- master key import ----------------------------- */

async function importAes(ver: number) {
    const b64 = getByokKey(ver);          // may be plain base64 or with "base64:" prefix
    const keyBytes = b64ToBytes(b64);
    if (keyBytes.length !== 32) {
        throw new Error(`BYOK master key must be 32 bytes after base64 decode; got ${keyBytes.length}`);
    }
    const keyBuffer = viewToArrayBuffer(keyBytes);
    return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
}

/* ------------------------------ main decrypt ------------------------------ */

export async function decryptBYOK(row: {
    key_version: number | string;

    // new-format columns (preferred: bytea)
    enc_iv?: string | Uint8Array | ArrayBuffer;
    enc_value?: string | Uint8Array | ArrayBuffer;
    enc_tag?: string | Uint8Array | ArrayBuffer;

    // legacy base64 columns
    enc_iv_b64?: string;
    enc_ct_b64?: string;
    enc_tag_b64?: string;
    enc_b64?: string;

    team_id: string;
    provider_id: string;
}) {
    const ver = typeof row.key_version === "number" ? row.key_version : parseInt(row.key_version);
    const key = await importAes(ver);

    let ivBytes: Uint8Array;
    let ctBytes: Uint8Array;

    if (row.enc_value !== undefined && row.enc_tag !== undefined && row.enc_iv !== undefined) {
        // New format (bytea or mixed): robustly decode each
        ivBytes = toBytesUnknown(row.enc_iv as any);
        const ctPart = toBytesUnknown(row.enc_value as any);
        const tagPart = toBytesUnknown(row.enc_tag as any);

        if (ivBytes.length !== 12) {
            throw new Error(`AES-GCM IV must be 12 bytes, got ${ivBytes.length}`);
        }
        if (tagPart.length !== 16) {
            throw new Error(`AES-GCM tag must be 16 bytes, got ${tagPart.length}`);
        }

        ctBytes = new Uint8Array(ctPart.length + tagPart.length);
        ctBytes.set(ctPart, 0);
        ctBytes.set(tagPart, ctPart.length);
    } else if (row.enc_b64 || (row.enc_ct_b64 && row.enc_tag_b64)) {
        // Legacy base64 fields
        ivBytes = b64ToBytes(row.enc_iv_b64!);
        if (row.enc_b64) {
            ctBytes = b64ToBytes(row.enc_b64);
        } else {
            const ctPart = b64ToBytes(row.enc_ct_b64!);
            const tagPart = b64ToBytes(row.enc_tag_b64!);
            if (tagPart.length !== 16) throw new Error(`AES-GCM tag must be 16 bytes, got ${tagPart.length}`);
            ctBytes = new Uint8Array(ctPart.length + tagPart.length);
            ctBytes.set(ctPart, 0);
            ctBytes.set(tagPart, ctPart.length);
        }
        if (ivBytes.length !== 12) {
            throw new Error(`AES-GCM IV must be 12 bytes, got ${ivBytes.length}`);
        }
    } else {
        throw new Error("Invalid BYOK row format: missing enc_iv/enc_value/enc_tag or legacy enc_*_b64 triplet");
    }

    const aad = te.encode(`${row.team_id}|${row.provider_id}|v${ver}`);

    const ptBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: viewToArrayBuffer(ivBytes), additionalData: viewToArrayBuffer(aad), tagLength: 128 },
        key,
        viewToArrayBuffer(ctBytes)
    );
    return new Uint8Array(ptBuf);
}

export function bytesToString(u8: Uint8Array): string {
    return td.decode(u8);
}









