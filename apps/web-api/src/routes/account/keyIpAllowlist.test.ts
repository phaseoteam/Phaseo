import { describe, expect, it } from "vitest";
import { keyIpAllowlistSchema } from "./keyIpAllowlist";

describe("key IP entry validation", () => {
    it.each(["203.0.113.1", "2001:db8::1", "203.0.113.0/24", "2001:db8::/32", "0.0.0.0/0", "::/0", "::ffff:203.0.113.1", "::ffff:203.0.113.0/120"])("accepts %s", (address) => {
        expect(keyIpAllowlistSchema.parse([{ label: " Production ", address: ` ${address} ` }])).toEqual([{ label: "Production", address }]);
    });
    it.each(["localhost", "256.0.0.1", "127.1", "1.2.3.4/33", "::/129", "::1%eth0", "", "1.2.3.4, 5.6.7.8"])("rejects %s", (address) => {
        expect(keyIpAllowlistSchema.safeParse([{ label: "Production", address }]).success).toBe(false);
    });
    it("requires labels and bounds the list", () => {
        expect(keyIpAllowlistSchema.safeParse([{ label: "  ", address: "::1" }]).success).toBe(false);
        expect(keyIpAllowlistSchema.safeParse(Array(101).fill({ label: "Office", address: "::1" })).success).toBe(false);
        expect(keyIpAllowlistSchema.parse([])).toEqual([]);
    });
});
