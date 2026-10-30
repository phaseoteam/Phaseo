import { canUpgradeCookieAuth } from "./cookieAuthRequest"

const APP_ORIGIN = "https://phaseo.app"

describe("canUpgradeCookieAuth", () => {
    it("allows same-origin browser requests", () => {
        const headers = new Headers({
            origin: APP_ORIGIN,
            referer: `${APP_ORIGIN}/chat`,
            "sec-fetch-site": "same-origin",
        })

        expect(canUpgradeCookieAuth(headers, APP_ORIGIN)).toBe(true)
    })

    it("allows trusted server requests without browser metadata", () => {
        expect(canUpgradeCookieAuth(new Headers(), APP_ORIGIN)).toBe(true)
    })

    it.each([
        ["cross-site", "https://attacker.example"],
        ["same-site", "https://evil.phaseo.app"],
    ])("rejects %s cookie-auth upgrades", (fetchSite, origin) => {
        const headers = new Headers({
            origin,
            referer: `${origin}/redirect`,
            "sec-fetch-site": fetchSite,
        })

        expect(canUpgradeCookieAuth(headers, APP_ORIGIN)).toBe(false)
    })

    it("rejects a mismatched Origin even without Fetch Metadata", () => {
        expect(
            canUpgradeCookieAuth(
                new Headers({ origin: "https://attacker.example" }),
                APP_ORIGIN
            )
        ).toBe(false)
    })
})
