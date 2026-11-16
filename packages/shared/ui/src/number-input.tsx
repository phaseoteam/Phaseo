"use client"

import * as React from "react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { MinusIcon, PlusIcon } from "lucide-react"

import { cn } from "./cn"

type NumberInputProps = Omit<NumberFieldPrimitive.Root.Props, "render"> & {
  /** Classes for the input itself; `className` styles the field. */
  inputClassName?: string
  /** Shows the − and + buttons. On by default. */
  steppers?: boolean
  placeholder?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
  /** Accessible names for the step buttons. */
  decrementLabel?: string
  incrementLabel?: string
}

/**
 * A number field with locale formatting (currency, percent, grouping), min/max
 * clamping, arrow keys (Shift for the large step, Alt for the small one) and
 * optional step buttons. Styled like `Input`; give it a `Label` via `id`.
 */
function NumberInput({
  className,
  inputClassName,
  steppers = true,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  ...props
}: NumberInputProps) {
  return (
    <NumberFieldPrimitive.Root
      data-slot="number-input"
      className={cn("w-full min-w-0", className)}
      {...props}
    >
      <NumberFieldPrimitive.Group
        data-slot="number-input-group"
        className={cn(
          "group/number-input relative flex h-8 w-full min-w-0 items-center rounded-md border border-transparent bg-input/50 transition-[color,box-shadow] duration-200 outline-none",
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30",
          "has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:border-destructive/50 dark:has-[input[aria-invalid=true]]:ring-destructive/40",
          "data-disabled:cursor-not-allowed data-disabled:opacity-50"
        )}
      >
        <NumberFieldPrimitive.Input
          data-slot="number-input-control"
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(
            "h-full w-full min-w-0 flex-1 bg-transparent px-2.5 py-1 text-base tabular-nums outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm",
            steppers && "pr-1",
            inputClassName
          )}
        />
        {steppers ? (
          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            <NumberFieldPrimitive.Decrement
              data-slot="number-input-decrement"
              aria-label={decrementLabel}
              className={stepButtonClassName}
            >
              <MinusIcon aria-hidden="true" />
            </NumberFieldPrimitive.Decrement>
            <NumberFieldPrimitive.Increment
              data-slot="number-input-increment"
              aria-label={incrementLabel}
              className={stepButtonClassName}
            >
              <PlusIcon aria-hidden="true" />
            </NumberFieldPrimitive.Increment>
          </div>
        ) : null}
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}

const stepButtonClassName =
  "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5"

export { NumberInput }
export type { NumberInputProps }
