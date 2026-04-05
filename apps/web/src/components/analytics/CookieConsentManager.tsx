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
  const shouldLoadGa = Boolean(gaMeasurementId && consent === "accepted")

  useEffect(() => {
    if (consent !== "pending") return
    setConsent(readAnalyticsConsent())
  }, [consent])

  useEffect(() => {
    if (consent === "pending") return
    applyGaConsent(consent ?? "denied", gaMeasurementId)
  }, [consent, gaMeasurementId])

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
            gtag('consent', 'update', ${JSON.stringify(GA_GRANTED_CONSENT)});
            gtag('config', '${gaMeasurementId}', { anonymize_ip: true });
          `}</Script>
        </>
      ) : null}

      {consent === null ? (
        <div className="fixed bottom-3 left-2 right-2 z-[100] w-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-lg sm:bottom-4 sm:left-auto sm:right-4 sm:w-[320px] sm:max-w-[calc(100vw-2rem)] dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Cookie Preferences
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            Manage analytics cookies. See our{" "}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button className="h-8 flex-1 px-2.5 text-xs" onClick={() => updateConsent("accepted")}>
              Accept
            </Button>
            <Button
              className="h-8 flex-1 px-2.5 text-xs"
              onClick={() => updateConsent("denied")}
              variant="outline"
            >
              Deny
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
