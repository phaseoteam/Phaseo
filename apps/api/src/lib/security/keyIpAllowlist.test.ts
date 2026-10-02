import { describe, expect, it } from "vitest";
import { isKeyIpAllowed } from "./keyIpAllowlist";

const policy = (address: string) => [{ label: "Production", address }];

describe("key IP allowlist", () => {
    it("preserves unrestricted keys", () => {
        for (const value of [undefined, null, []]) expect(isKeyIpAllowed(value, null)).toBe(true);
    });
    it.each([
        ["203.0.113.10", "203.0.113.10", true],
        ["203.0.113.10", "203.0.113.11", false],
        ["203.0.113.128/25", "203.0.113.127", false],
        ["203.0.113.128/25", "203.0.113.255", true],
        ["203.0.113.10/32", "203.0.113.10", true],
        ["0.0.0.0/0", "198.51.100.2", true],
        ["2001:db8::1", "2001:0db8:0:0:0:0:0:1", true],
        ["2001:db8::/32", "2001:db8:ffff::1", true],
        ["2001:db8::/32", "2001:db9::1", false],
        ["2001:db8::/65", "2001:db8:0:0:8000::1", false],
        ["2001:db8::/65", "2001:db8:0:0:7fff::1", true],
        ["::/0", "203.0.113.10", false],
        ["203.0.113.0/24", "::ffff:203.0.113.10", true],
        ["::ffff:203.0.113.0/120", "203.0.113.10", true],
        ["::1/128", "::1", true],
        ["::1/128", "::2", false],
    ])("matches %s against %s", (address, clientIp, expected) => {
        expect(isKeyIpAllowed(policy(address), clientIp)).toBe(expected);
    });
    it("rejects missing, malformed, and header-list client IPs", () => {
        for (const ip of [null, "garbage", "203.0.113.10, 198.51.100.2", "203.0.113.10/24", "::1%eth0"]) {
            expect(isKeyIpAllowed(policy("0.0.0.0/0"), ip)).toBe(false);
        }
    });
    it("fails closed for malformed policies", () => {
        for (const value of [{}, policy("bad"), policy("203.0.113.0/33"), policy("::/129")]) {
            expect(isKeyIpAllowed(value, "203.0.113.10")).toBe(false);
        }
    });
    it("allows a match in any labeled entry", () => {
        expect(isKeyIpAllowed([...policy("::1"), ...policy("203.0.113.10")], "203.0.113.10")).toBe(true);
    });
});
