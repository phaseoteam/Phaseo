export type AnalyticsConsent = "accepted" | "denied"

export const ANALYTICS_CONSENT_COOKIE_NAME = "phaseo_analytics_consent"
const LEGACY_ANALYTICS_CONSENT_COOKIE_NAME = "ai_stats_analytics_consent"
export const ANALYTICS_CONSENT_STORAGE_KEY = ANALYTICS_CONSENT_COOKIE_NAME
const LEGACY_ANALYTICS_CONSENT_STORAGE_KEY = LEGACY_ANALYTICS_CONSENT_COOKIE_NAME
export const ANALYTICS_CONSENT_EVENT = "phaseo:analytics-consent"
export const LEGACY_ANALYTICS_CONSENT_EVENT = "ai-stats:analytics-consent"

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

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
