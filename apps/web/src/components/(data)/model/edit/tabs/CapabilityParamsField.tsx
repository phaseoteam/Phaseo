"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Textarea } from "@/components/ui/textarea"
import {
  describeStoredParams,
  parseStoredParams,
  type StoredCapabilityParams,
} from "@/lib/models/capabilityParamsEdit"

/**
 * The route's full parameter specs as JSON, with a preview of the allowed
 * values the playground and models API will read from them.
 */
export function CapabilityParamsField({
  params,
  onChange,
}: {
  params: StoredCapabilityParams
  onChange: (params: StoredCapabilityParams) => void
}) {
  const tEditor = useTranslations("Common.ui.modelEditor")
  const serialized = useMemo(() => JSON.stringify(params ?? {}, null, 2), [params])
  const [text, setText] = useState(serialized)
  const [error, setError] = useState<string | null>(null)

  // A toggle outside this field changed the params: show the new JSON.
  useEffect(() => {
    setText(serialized)
    setError(null)
  }, [serialized])

  const preview = useMemo(
    () =>
      describeStoredParams(params).map((entry) => {
        if (!entry.supported) return `${entry.name}: ${tEditor("parameterPreviewUnsupported")}`
        const range = entry.range
          ? `${entry.range.min ?? "…"}–${entry.range.max ?? "…"}${
              entry.range.step ? ` ${tEditor("parameterPreviewStep", { step: entry.range.step })}` : ""
            }`
          : null
        const values = entry.values
          ? entry.values.join(", ") + (entry.more ? ` ${tEditor("parameterPreviewMore", { count: entry.more })}` : "")
          : null
        const parts = [
          values ?? range,
          entry.default !== undefined ? tEditor("parameterPreviewDefault", { value: entry.default }) : null,
          entry.rules ? tEditor("parameterPreviewRules", { count: entry.rules }) : null,
        ].filter(Boolean)
        return `${entry.name}: ${parts.join(" · ")}`
      }),
    [params, tEditor],
  )

  return (
    <div className="grid gap-2">
      <Textarea
        value={text}
        spellCheck={false}
        rows={Math.min(18, Math.max(4, text.split("\n").length))}
        className="font-mono text-xs"
        aria-invalid={error ? true : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const parsed = parseStoredParams(text)
          if (parsed.ok === false) {
            setError(parsed.error)
            return
          }
          setError(null)
          onChange(parsed.params)
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {tEditor("parameterSpecsInvalid", { error })}
        </p>
      ) : null}
      {preview.length > 0 ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {preview.map((line) => (
            <li key={line} className="truncate">{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
