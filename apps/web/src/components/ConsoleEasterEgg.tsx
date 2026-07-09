"use client"

import { useEffect } from "react"

const PHASEO_ASCII = [
  " ____  _   _    _    ____  _____ ___  ",
  "|  _ \\| | | |  / \\  / ___|| ____/ _ \\ ",
  "| |_) | |_| | / _ \\ \\___ \\|  _|| | | |",
  "|  __/|  _  |/ ___ \\ ___) | |__| |_| |",
  "|_|   |_| |_/_/   \\_\\____/|_____\\___/ ",
].join("\n")

declare global {
  interface Window {
    __phaseoAsciiShown?: true
  }
}

export function ConsoleEasterEgg() {
  useEffect(() => {
    if (window.__phaseoAsciiShown) {
      return
    }

    window.__phaseoAsciiShown = true
    console.log(`\n${PHASEO_ASCII}\n`)
  }, [])

  return null
}
