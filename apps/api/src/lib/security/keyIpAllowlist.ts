import { z } from "zod";

const ipv4 = z.ipv4();

function parseAddress(value: string): { bytes: number[]; bits: number } | null {
    if (ipv4.safeParse(value).success) return { bytes: value.split(".").map(Number), bits: 32 };
    if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
    try {
        // WHATWG URL validates and canonicalizes IPv6, including embedded IPv4.
        const hostname = new URL(`http://[${value}]/`).hostname.slice(1, -1);
        const halves = hostname.split("::");
        const left = halves[0] ? halves[0].split(":") : [];
        const right = halves[1] ? halves[1].split(":") : [];
        const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
        const bytes = groups.flatMap((group) => { const word = Number.parseInt(group, 16); return [word >> 8, word & 255]; });
        return { bytes, bits: 128 };
    } catch { return null; }
}

function isMapped(bytes: number[]) {
    return bytes.length === 16 && bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 255 && bytes[11] === 255;
}

function matches(client: ReturnType<typeof parseAddress>, address: string): boolean {
    const parts = address.split("/");
    const network = parseAddress(parts[0]);
    if (!client || !network || parts.length > 2) return false;
    let bits = parts.length === 1 ? network.bits : /^\d{1,3}$/.test(parts[1]) ? Number(parts[1]) : -1;
    if (bits < 0 || bits > network.bits) return false;
    let networkBytes = network.bytes;
    let clientBytes = client.bytes;
    if (isMapped(clientBytes)) clientBytes = clientBytes.slice(12);
    if (isMapped(networkBytes) && bits >= 96) { networkBytes = networkBytes.slice(12); bits -= 96; }
    if (clientBytes.length !== networkBytes.length) return false;
    return networkBytes.every((byte, index) => {
        const remaining = Math.max(0, Math.min(8, bits - index * 8));
        const mask = remaining === 0 ? 0 : (255 << (8 - remaining)) & 255;
        return (clientBytes[index] & mask) === (byte & mask);
    });
}

/** Empty policies preserve unrestricted keys. Invalid policies fail closed. */
export function isKeyIpAllowed(policy: unknown, clientIp: string | null): boolean {
    if (policy === undefined || policy === null) return true;
    if (!Array.isArray(policy)) return false;
    if (policy.length === 0) return true;
    if (!clientIp) return false;
    try {
        // Cloudflare supplies one address. Never trust forwarded header lists.
        const client = parseAddress(clientIp);
        return policy.some((entry) => {
            if (!entry || typeof entry.address !== "string") return false;
            try {
                return matches(client, entry.address);
            } catch { return false; }
        });
    } catch { return false; }
}
