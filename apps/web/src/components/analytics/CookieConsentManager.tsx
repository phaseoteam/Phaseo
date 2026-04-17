"use client"

import Link from "next/link"
import Script from "next/script"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsent,
  parseAnalyticsConsent,
  persistAnalyticsConsent,
  readAnalyticsConsent,
} from "@/lib/cookieConsent"

type CookieConsentManagerProps = {
  gaMeasurementId?: string
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    [key: string]: unknown
  }
}

const GA_DENIED_CONSENT = {
  ad_personalization: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  analytics_storage: "denied",
} as const

const GA_GRANTED_CONSENT = {
  ad_personalization: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  analytics_storage: "granted",
} as const

function applyGaConsent(consent: AnalyticsConsent, gaMeasurementId?: string) {
  if (typeof window === "undefined" || !gaMeasurementId) {
    return
  }

  if (typeof window.gtag === "function") {
    window.gtag(
      "consent",
      "update",
      consent === "accepted" ? GA_GRANTED_CONSENT : GA_DENIED_CONSENT
    )
  }
}

export function CookieConsentManager({
  gaMeasurementId,
}: CookieConsentManagerProps) {
  const [consent, setConsent] = useState<AnalyticsConsent | null | "pending">(() => {
    if (typeof window === "undefined") return "pending"
    return readAnalyticsConsent()
  })
  const [feedback, setFeedback] = useState<{
    message: string
    title: string
  } | null>(null)
  // Load GA with denied-by-default consent mode so we can still verify install
  // health and collect modeled/cookieless signals until explicit consent.
  const shouldLoadGa = Boolean(gaMeasurementId)

  useEffect(() => {
    if (consent !== "pending") return
    setConsent(readAnalyticsConsent())
  }, [consent])

  useEffect(() => {
    if (consent === "pending") return
    applyGaConsent(consent ?? "denied", gaMeasurementId)
  }, [consent, gaMeasurementId])

  useEffect(() => {
    if (!feedback) return
    const timeoutId = window.setTimeout(() => setFeedback(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_STORAGE_KEY) return
      const next = parseAnalyticsConsent(event.newValue)
      if (!next) return
      setConsent(next)
    }

    const onConsent = (event: Event) => {
      const customEvent = event as CustomEvent<AnalyticsConsent>
      const next = parseAnalyticsConsent(customEvent.detail)
      if (!next) return
      setConsent(next)
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent)
    }
  }, [])

  function updateConsent(next: AnalyticsConsent) {
    persistAnalyticsConsent(next)
    setConsent(next)
    applyGaConsent(next, gaMeasurementId)
    if (next === "accepted") {
      setFeedback({
        title: "Thanks for helping us improve your experience.",
        message: "This can always be changed in Settings.",
      })
      return
    }

    setFeedback({
      title: "Analytics cookies declined.",
      message: "This can always be changed in Settings.",
    })
  }

  return (
    <>
      {shouldLoadGa ? (
        <>
          <Script
            id="google-analytics-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="lazyOnload"
          />
          <Script id="google-analytics-init" strategy="lazyOnload">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('consent', 'default', ${JSON.stringify(GA_DENIED_CONSENT)});
            gtag('config', '${gaMeasurementId}', { anonymize_ip: true });
          `}</Script>
        </>
      ) : null}

      {consent === null ? (
        <div className="fixed bottom-4 left-4 right-4 z-[100] w-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-[480px] sm:max-w-[calc(100vw-2.5rem)] dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Cookie Preferences
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            We use analytics cookies to measure traffic and improve AI Stats.
            You can change your mind anytime in Settings, and read more in our{" "}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Button
              className="h-10 flex-1 px-3 text-sm"
              onClick={() => updateConsent("denied")}
              variant="outline"
            >
              Decline
            </Button>
            <Button className="h-10 flex-1 px-3 text-sm" onClick={() => updateConsent("accepted")}>
              Accept
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-[100] w-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-[480px] sm:max-w-[calc(100vw-2.5rem)] dark:border-zinc-800 dark:bg-zinc-950"
          role="status"
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {feedback.title}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {feedback.message}
          </p>
        </div>
      ) : null}
    </>
  )
}
