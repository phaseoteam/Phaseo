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
