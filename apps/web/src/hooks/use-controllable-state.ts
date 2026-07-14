"use client"

import * as React from "react"

type UseControllableStateParams<T> = {
  prop?: T
  defaultProp: T
  onChange?: (value: T) => void
}

/**
 * Keeps the controlled/uncontrolled API previously provided by Radix local to
 * the app, so components can use it without retaining a Radix dependency.
 */
function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? prop : uncontrolledValue
  const onChangeRef = React.useRef(onChange)
  const previousUncontrolledValueRef = React.useRef(uncontrolledValue)

  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const handleChange = React.useCallback((nextValue: T) => {
    onChangeRef.current?.(nextValue)
  }, [])

  React.useEffect(() => {
    if (previousUncontrolledValueRef.current !== uncontrolledValue) {
      handleChange(uncontrolledValue)
      previousUncontrolledValueRef.current = uncontrolledValue
    }
  }, [handleChange, uncontrolledValue])

  const setValue = React.useCallback(
    (nextValue: React.SetStateAction<T>) => {
      if (isControlled) {
        const resolvedValue =
          typeof nextValue === "function"
            ? (nextValue as (previousValue: T) => T)(prop as T)
            : nextValue

        if (resolvedValue !== prop) {
          handleChange(resolvedValue)
        }
      } else {
        setUncontrolledValue(nextValue)
      }
    },
    [handleChange, isControlled, prop]
  )

  return [value, setValue] as const
}

export { useControllableState }
