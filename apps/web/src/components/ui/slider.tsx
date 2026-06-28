import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  onValueChange,
  onValueCommit,
  onValueCommitted,
  min = 0,
  max = 100,
  ...props
}: Omit<
  SliderPrimitive.Root.Props<readonly number[]>,
  "defaultValue" | "onValueChange" | "onValueCommitted" | "value"
> & {
  defaultValue?: readonly number[]
  value?: readonly number[]
  onValueChange?: (value: readonly number[]) => void
  onValueCommit?: (value: readonly number[]) => void
  onValueCommitted?: (value: readonly number[]) => void
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
      onValueCommitted={(nextValue) => {
        onValueCommitted?.(nextValue)
        onValueCommit?.(nextValue)
      }}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-oklch(0.97 0 0) select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1 dark:bg-oklch(0.269 0 0)"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-oklch(0.205 0 0) select-none data-horizontal:h-full data-vertical:w-full dark:bg-oklch(0.922 0 0)"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative block size-3 shrink-0 rounded-full border border-oklch(0.922 0 0) border-oklch(0.708 0 0) bg-white ring-oklch(0.708 0 0)/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50 dark:border-oklch(1 0 0 / 10%) dark:border-oklch(0.556 0 0) dark:ring-oklch(0.556 0 0)/50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
