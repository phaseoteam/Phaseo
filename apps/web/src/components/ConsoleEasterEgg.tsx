"use client"

import { useEffect } from "react"

const AI_STATS_ASCII = [
  "    _    ___      ____ _____  _    _____ ____  ",
  "   / \\  |_ _|    / ___|_   _|/ \\  |_   _/ ___| ",
  "  / _ \\  | |     \\___ \\ | | / _ \\   | | \\___ \\ ",
  " / ___ \\ | |      ___) || |/ ___ \\  | |  ___) |",
  "/_/   \\_\\___|    |____/ |_/_/   \\_\\ |_| |____/ ",
].join("\n")

declare global {
  interface Window {
    __aiStatsAsciiShown?: true
  }
}

export function ConsoleEasterEgg() {
  useEffect(() => {
    if (window.__aiStatsAsciiShown) {
      return
    }

    window.__aiStatsAsciiShown = true
    console.log(`\n${AI_STATS_ASCII}\n`)
  }, [])

  return null
}
