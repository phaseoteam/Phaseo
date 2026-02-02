// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

// apps/web/src/lib/id/ulid.ts
// Edge-safe ULID generator
//
// ULID (Universally Unique Lexicographically Sortable Identifier) format:
// - 128 bits total
// - 48 bits of timestamp (millisecond precision, good for sorting by time)
// - 80 bits of randomness (for uniqueness even if timestamps collide)
// - Encoded in Crockford's Base32 alphabet -> 26 characters long
//
// This implementation is designed to be safe for "edge runtimes"
// (e.g. Cloudflare Workers, Vercel Edge, Deno Deploy), where Node's crypto
// APIs may not exist but `globalThis.crypto.getRandomValues` does.

// Crockford Base32 alphabet (no I, L, O, U to avoid confusion in text)
const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Number of random bytes to generate (10 bytes = 80 bits).
// These 80 bits expand to 16 characters when base32 encoded.
const RAND_LEN = 10;

let lastTime = -1; // last timestamp (ms) used in ULID generation
const randBuf = new Uint8Array(RAND_LEN);
// Buffer reused between ULIDs so we don’t keep allocating new arrays

// --- ENCODING HELPERS ---

// Encode a millisecond timestamp into 10 Base32 characters.
// ULID spec requires 48 bits for time -> max value 2^48-1.
// 10 Base32 chars = 10 × 5 bits = 50 bits, which is enough.
// We repeatedly mod/divide by 32 to extract 5-bit chunks from `t`.
function encodeTime(t: number): string {
    let out = "";
    for (let i = 0; i < 10; i++) {
        const mod = t % 32;           // lowest 5 bits
        out = ENC[mod] + out;         // prepend corresponding Base32 char
        t = Math.floor(t / 32);       // shift right by 5 bits
    }
    return out;                       // always exactly 10 chars
}

// Encode 10 random bytes into 16 Base32 characters.
// We take 8 bits at a time, shift into a buffer, and extract 5-bit chunks.
// This ensures uniform distribution across the alphabet.
function encodeRand(bytes: Uint8Array): string {
    let out = "";
    let buffer = 0;  // temporary bit accumulator
    let bits = 0;    // number of bits currently in buffer

    for (let i = 0; i < bytes.length; i++) {
        buffer = (buffer << 8) | bytes[i]; // add 8 bits
        bits += 8;

        // While we have at least 5 bits, extract one Base32 char
        while (bits >= 5) {
            bits -= 5;
            const idx = (buffer >>> bits) & 31; // take top 5 bits
            out += ENC[idx];
        }
    }

    // If leftover bits remain, pad them into one last character
    if (bits > 0) out += ENC[(buffer << (5 - bits)) & 31];

    // Ensure output is exactly 16 chars (pad or truncate if needed)
    if (out.length < 16) out = out.padEnd(16, "0");
    else if (out.length > 16) out = out.slice(0, 16);

    return out;
}

// Fill a buffer with secure random bytes using Web Crypto API.
// This works in browsers and edge runtimes (not Node-only APIs).
function fillRandom(buf: Uint8Array): void {
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error("Web Crypto not available in this runtime");
    }
    globalThis.crypto.getRandomValues(buf);
}

// Increment a random buffer (like a big-endian integer).
// This is used when multiple ULIDs are generated within the same millisecond.
// Ensures monotonicity (ULIDs increase lexicographically).
function incrementRand(buf: Uint8Array): void {
    for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] < 255) {
            buf[i]++;
            return;
        }
        buf[i] = 0; // carry over
    }
    // Overflowing 80 bits would require 2^80 ULIDs in a single ms,
    // which is practically impossible. We just wrap to zero if it happens.
}

// --- MAIN EXPORTS ---

// Generate a ULID string (26 characters).
// - First 10 chars = time (sortable, ms resolution).
// - Next 16 chars = randomness (uniqueness).
export function ulid(): string {
    const now = Date.now();

    if (now === lastTime) {
        // Same millisecond: increment randomness to avoid duplicates
        incrementRand(randBuf);
    } else {
        // New millisecond: reseed randomness
        fillRandom(randBuf);
        lastTime = now;
    }

    return encodeTime(now) + encodeRand(randBuf);
}

// Generate a public-facing ID with optional shard prefix.
// Example: "G-europe-01HZY0EFSK2C2W5QAV9YJQW3Q7"
// Example without shard: "G-01HZY0EFSK2C2W5QAV9YJQW3Q7"
export function generatePublicId(shard?: string): string {
    const core = ulid();
    return shard ? `G-${shard}-${core}` : `G-${core}`;
}

