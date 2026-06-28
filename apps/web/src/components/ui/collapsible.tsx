"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { renderAsChild } from "@/components/ui/base-ui-compat"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  asChild,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props & {
  asChild?: boolean
}) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      render={renderAsChild(asChild, children)}
      {...props}
    >
      {asChild ? null : children}
    </CollapsiblePrimitive.Trigger>
  )
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
