export type AnalyticsConsent = "accepted" | "denied"

export const ANALYTICS_CONSENT_COOKIE_NAME = "phaseo_analytics_consent"
const LEGACY_ANALYTICS_CONSENT_COOKIE_NAME = "ai_stats_analytics_consent"
export const ANALYTICS_CONSENT_STORAGE_KEY = ANALYTICS_CONSENT_COOKIE_NAME
const LEGACY_ANALYTICS_CONSENT_STORAGE_KEY = LEGACY_ANALYTICS_CONSENT_COOKIE_NAME
export const ANALYTICS_CONSENT_EVENT = "phaseo:analytics-consent"
export const LEGACY_ANALYTICS_CONSENT_EVENT = "ai-stats:analytics-consent"

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

export function readAnalyticsConsentFromCookieHeader(cookieHeader: string | null | undefined): AnalyticsConsent | null {
  if (!cookieHeader) return null
  const names = [ANALYTICS_CONSENT_COOKIE_NAME, LEGACY_ANALYTICS_CONSENT_COOKIE_NAME]
  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=")
    if (!names.includes(rawName)) continue
    return parseAnalyticsConsent(rawValue.join("="))
  }
  return null
}

export function parseAnalyticsConsent(
  value: string | null | undefined
): AnalyticsConsent | null {
  if (value === "accepted" || value === "denied") {
    return value
  }

  return null
}

function readConsentFromCookie(): AnalyticsConsent | null {
  if (typeof document === "undefined") {
    return null
  }

  const keys = [
    `${ANALYTICS_CONSENT_COOKIE_NAME}=`,
    `${LEGACY_ANALYTICS_CONSENT_COOKIE_NAME}=`,
  ]
  const cookies = document.cookie.split(";")

  for (const entry of cookies) {
    const cookie = entry.trim()
    for (const key of keys) {
      if (!cookie.startsWith(key)) continue
      return parseAnalyticsConsent(cookie.slice(key.length))
    }
  }

  return null
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const storageValue = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
    const parsed = parseAnalyticsConsent(storageValue)
    if (parsed) return parsed
    const legacyStorageValue = window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_STORAGE_KEY)
    const legacyParsed = parseAnalyticsConsent(legacyStorageValue)
    if (legacyParsed) return legacyParsed
  } catch {
    // Ignore storage access errors in privacy-focused browsers.
  }

  return readConsentFromCookie()
}

export function persistAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent)
    window.localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_STORAGE_KEY)
  } catch {
    // Ignore storage access errors in privacy-focused browsers.
  }

  document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=${consent}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`
  document.cookie = `${LEGACY_ANALYTICS_CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_EVENT, {
      detail: consent,
    })
  )
  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(LEGACY_ANALYTICS_CONSENT_EVENT, {
      detail: consent,
    })
  )
}

// Emailed feedback links carry their only credential in the path, and the Slack agent's
// account links (/slack/link?token=…) in the query. Analytics stays off for the whole
// page load when it starts on one, even after navigating on, so the token never reaches
// GA, Vercel or PostHog through page URLs, history page views or replay. The navigation
// entry is the URL the document was first loaded from.
const CREDENTIAL_PATH_PATTERN = /^(?:\/[^/]+)?\/(?:feedback\/[^/]+|slack\/link(?:\/|$))/

export function isAnalyticsBlockedPath(pathname: string): boolean {
  return CREDENTIAL_PATH_PATTERN.test(pathname)
}

export function isAnalyticsBlockedForPageLoad(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const entry = window.performance?.getEntriesByType?.("navigation")[0]
  try {
    return isAnalyticsBlockedPath(new URL(entry?.name || window.location.href).pathname)
  } catch {
    return false
  }
}
