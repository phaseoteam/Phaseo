"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/react"

const ANALYTICS_DEFER_MS = 2500

export function DeferredVercelAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
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
  }, [])

  return enabled ? <Analytics /> : null
}

