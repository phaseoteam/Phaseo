// Which addresses may use an API key: a labelled list of IPv4 or IPv6 addresses
// and CIDR ranges. The settings API and the gateway's /v1 control plane each use
// a generated copy (scripts/sync-key-ip-allowlist.mjs), so the dashboard and the
// API accept the same lists. The gateway's matcher is lib/security/keyIpAllowlist.ts.

import { z } from "zod";

const ipv6 = z.string().refine((value) => {
    if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) return false;
    try { new URL(`http://[${value}]/`); return true; } catch { return false; }
}, "Invalid IPv6 address");

const cidrv6 = z.string().refine((value) => {
    const parts = value.split("/");
    return parts.length === 2 && ipv6.safeParse(parts[0]).success && /^\d{1,3}$/.test(parts[1]) && Number(parts[1]) <= 128;
}, "Invalid IPv6 CIDR range");

export const keyIpAllowlistSchema = z.array(z.object({
    label: z.string().trim().min(1).max(100),
    address: z.string().trim().pipe(z.union([z.ipv4(), ipv6, z.cidrv4(), cidrv6])),
})).max(100);
