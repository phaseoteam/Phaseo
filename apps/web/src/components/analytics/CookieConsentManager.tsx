"use client"

import Link from "next/link"
import Script from "next/script"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
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

  const disableKey = `ga-disable-${gaMeasurementId}`
  window[disableKey] = consent !== "accepted"

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
  const [consent, setConsent] = useState<AnalyticsConsent | null | "pending">("pending")

  useEffect(() => {
    setConsent(readAnalyticsConsent())
  }, [])

  useEffect(() => {
    if (consent !== "accepted" && consent !== "denied") return
    applyGaConsent(consent, gaMeasurementId)
  }, [consent, gaMeasurementId])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_STORAGE_KEY) return
      const next = parseAnalyticsConsent(event.newValue)
      if (!next) return
      setConsent(next)
    }

    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  function updateConsent(next: AnalyticsConsent) {
    persistAnalyticsConsent(next)
    setConsent(next)
    applyGaConsent(next, gaMeasurementId)
  }

  return (
    <>
      {gaMeasurementId && consent === "accepted" ? (
        <>
          <Script
            id="google-analytics-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics-init" strategy="afterInteractive">{`
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
        <div className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-[360px] sm:max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            We use analytics cookies to improve AI Stats. You can accept or
            deny analytics tracking.
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Learn more in our{" "}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button className="h-8 px-3 text-xs" onClick={() => updateConsent("accepted")}>Accept</Button>
            <Button
              className="h-8 px-3 text-xs"
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
