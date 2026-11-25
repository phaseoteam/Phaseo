import { IntentLink as Link } from "@/components/navigation/IntentLink"
import Script from "@/components/script"
import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsent,
  isAnalyticsBlockedForPageLoad,
  parseAnalyticsConsent,
  persistAnalyticsConsent,
  readAnalyticsConsent,
} from "@/lib/cookieConsent"

type CookieConsentManagerProps = {
  copy: CookieConsentCopy
  gaMeasurementId?: string
}

export type CookieConsentCopy = {
  accept: string
  acceptedTitle: string
  bodyAfterPrivacy: string
  bodyBeforePrivacy: string
  decline: string
  declinedTitle: string
  feedbackMessage: string
  privacyPolicy: string
  title: string
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
  copy,
  gaMeasurementId,
}: CookieConsentManagerProps) {
  const [consent, setConsent] = useState<AnalyticsConsent | null | "pending">("pending")
  const [feedback, setFeedback] = useState<{
    message: string
    title: string
  } | null>(null)
  // Do not load third-party analytics until consent is explicit. This keeps
  // pending and declined visits free of analytics network requests.
  const shouldLoadGa =
    Boolean(gaMeasurementId) && consent === "accepted" && !isAnalyticsBlockedForPageLoad()

  useEffect(() => {
    if (consent !== "pending") return
    setConsent(readAnalyticsConsent())
  }, [consent])

  useEffect(() => {
    if (consent === "pending") return
    applyGaConsent(consent ?? "denied", gaMeasurementId)
  }, [consent, gaMeasurementId])

  // While the banner is open, reserve room for it at the bottom of the page so
  // focused elements scroll clear of it instead of sitting underneath
  // (WCAG 2.4.11 Focus Not Obscured).
  const bannerRef = useRef<HTMLDivElement>(null)
  const bannerTitleId = useId()
  const bannerOpen = consent === null
  useEffect(() => {
    const banner = bannerRef.current
    if (!bannerOpen || !banner) return
    const root = document.documentElement
    const previousScrollPadding = root.style.scrollPaddingBottom
    // The body is fixed at 100% height, so padding on it adds no scroll room;
    // globals.css turns this variable into a spacer after the page content.
    const reserve = () => {
      const offset = window.innerHeight - banner.getBoundingClientRect().top
      const space = `${Math.max(0, Math.ceil(offset)) + 16}px`
      root.style.scrollPaddingBottom = space
      root.style.setProperty("--cookie-banner-space", space)
    }
    reserve()
    const observer = new ResizeObserver(reserve)
    observer.observe(banner)
    window.addEventListener("resize", reserve)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", reserve)
      root.style.scrollPaddingBottom = previousScrollPadding
      root.style.removeProperty("--cookie-banner-space")
    }
  }, [bannerOpen])

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
        title: copy.acceptedTitle,
        message: copy.feedbackMessage,
      })
      return
    }

    setFeedback({
      title: copy.declinedTitle,
      message: copy.feedbackMessage,
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
            gtag('consent', 'default', ${JSON.stringify(GA_GRANTED_CONSENT)});
            gtag('config', '${gaMeasurementId}', { anonymize_ip: true });
          `}</Script>
        </>
      ) : null}

      {bannerOpen ? (
        <div
          ref={bannerRef}
          role="region"
          aria-labelledby={bannerTitleId}
          className="fixed bottom-4 left-4 right-4 z-[100] w-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-[480px] sm:max-w-[calc(100vw-2.5rem)] dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p id={bannerTitleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {copy.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {copy.bodyBeforePrivacy}{" "}
            <Link className="underline" href="/privacy">
              {copy.privacyPolicy}
            </Link>
            {copy.bodyAfterPrivacy}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Button
              className="h-10 flex-1 px-3 text-sm"
              onClick={() => updateConsent("denied")}
              variant="outline"
            >
              {copy.decline}
            </Button>
            <Button className="h-10 flex-1 px-3 text-sm" onClick={() => updateConsent("accepted")}>
              {copy.accept}
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
