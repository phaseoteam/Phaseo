"use client"

import * as React from "react"
import { ScrollArea as SharedScrollArea, ScrollBar } from "@phaseo/ui/scroll-area"

// Many pages lay out the scroll area's children through `viewportClassName`
// (grids, flex rows, dividers), so the website puts children straight into the
// viewport. Pass `wrapContent` to opt a scroll area into the shared default.
function ScrollArea({ wrapContent = false, ...props }: React.ComponentProps<typeof SharedScrollArea>) {
  return <SharedScrollArea wrapContent={wrapContent} {...props} />
}

export { ScrollArea, ScrollBar }
