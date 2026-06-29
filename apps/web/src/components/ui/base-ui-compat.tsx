import * as React from "react"

type RenderableChild = React.ReactElement<Record<string, unknown>>

function renderAsChild(
  asChild: boolean | undefined,
  children: React.ReactNode
) {
  return asChild && React.isValidElement(children)
    ? (children as RenderableChild)
    : undefined
}

export { renderAsChild }
