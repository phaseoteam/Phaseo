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
  SliderPrimitive.Root.Props,
  "defaultValue" | "value" | "onValueChange" | "onValueCommitted"
> & {
  defaultValue?: readonly number[] | number
  value?: readonly number[] | number
  onValueChange?: (
    value: number[],
    eventDetails?: SliderPrimitive.Root.ChangeEventDetails
  ) => void
  onValueCommit?: (value: number[]) => void
  onValueCommitted?: (value: number[]) => void
}) {
  const resolvedDefaultValue =
    typeof defaultValue === "number" ? [defaultValue] : defaultValue
  const resolvedValue = typeof value === "number" ? [value] : value
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(resolvedDefaultValue)
      ? resolvedDefaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={resolvedDefaultValue}
      value={resolvedValue}
      onValueChange={(nextValue, eventDetails) => {
        onValueChange?.([...nextValue], eventDetails)
      }}
      onValueCommitted={(nextValue) => {
        const committedValue = [...nextValue]
        onValueCommitted?.(committedValue)
        onValueCommit?.(committedValue)
      }}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-2xl bg-input/90 select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="block size-4 shrink-0 rounded-2xl bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow] duration-200 select-none not-dark:bg-clip-padding hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
