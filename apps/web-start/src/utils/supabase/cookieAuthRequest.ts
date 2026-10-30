const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"])

function headerOrigin(value: string | null): string | null {
    if (!value) return null
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

export function canUpgradeCookieAuth(
    headers: Headers,
    requestOrigin: string
): boolean {
    const fetchSite = headers.get("sec-fetch-site")?.toLowerCase()
    if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) return false

    const origin = headerOrigin(headers.get("origin"))
    if (headers.has("origin") && origin !== requestOrigin) return false

    const referer = headerOrigin(headers.get("referer"))
    if (headers.has("referer") && referer !== requestOrigin) return false

    return true
}
