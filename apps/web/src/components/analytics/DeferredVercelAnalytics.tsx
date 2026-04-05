"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/react"
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsent,
  parseAnalyticsConsent,
  readAnalyticsConsent,
} from "@/lib/cookieConsent"

const ANALYTICS_DEFER_MS = 2500

export function DeferredVercelAnalytics() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => {
    if (typeof window === "undefined") return null
    return readAnalyticsConsent()
  })
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_STORAGE_KEY) return
      setConsent(parseAnalyticsConsent(event.newValue))
    }

    const onConsent = (event: Event) => {
      const customEvent = event as CustomEvent<AnalyticsConsent>
      setConsent(parseAnalyticsConsent(customEvent.detail))
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent)
    }
  }, [])

  useEffect(() => {
    if (consent !== "accepted") {
      setEnabled(false)
      return
    }

    let timeoutId: number | undefined
    const enableAnalytics = () => {
      timeoutId = window.setTimeout(() => {
        setEnabled(true)
      }, ANALYTICS_DEFER_MS)
    }

    if (document.readyState === "complete") {
      enableAnalytics()
    } else {
      window.addEventListener("load", enableAnalytics, { once: true })
    }

    return () => {
      window.removeEventListener("load", enableAnalytics)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [consent])

  return enabled ? <Analytics /> : null
}
