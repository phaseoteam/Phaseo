import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

function normalizeAccordionValue(value: string | string[] | undefined) {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value : [value]
}

function Accordion({
  className,
  type = "single",
  defaultValue,
  value,
  onValueChange,
  collapsible,
  ...props
}: Omit<
  AccordionPrimitive.Root.Props,
  "defaultValue" | "multiple" | "onValueChange" | "value"
> & {
  type?: "single" | "multiple"
  collapsible?: boolean
  defaultValue?: any
  value?: any
  onValueChange?: (value: any) => void
}) {
  const multiple = type === "multiple"
  void collapsible

  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      defaultValue={normalizeAccordionValue(defaultValue)}
      value={normalizeAccordionValue(value)}
      multiple={multiple}
      onValueChange={(nextValue) => {
        onValueChange?.(multiple ? nextValue : (nextValue[0] ?? ""))
      }}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-oklch(0.922 0 0) border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 focus-visible:after:border-oklch(0.708 0 0) aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-oklch(0.556 0 0) dark:border-oklch(1 0 0 / 10%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:focus-visible:after:border-oklch(0.556 0 0) dark:**:data-[slot=accordion-trigger-icon]:text-oklch(0.708 0 0)",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon data-slot="accordion-trigger-icon" className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden" />
        <ChevronUpIcon data-slot="accordion-trigger-icon" className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  disableAnimation,
  ...props
}: AccordionPrimitive.Panel.Props & {
  disableAnimation?: boolean
}) {
  void disableAnimation

  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-oklch(0.145 0 0) [&_p:not(:last-child)]:mb-4 dark:[&_a]:hover:text-oklch(0.985 0 0)",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
