"use client"

import { useEffect, useRef, useState } from "react"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/utils/supabase/client"
import type { ModelData } from "../ModelEditDialog"

interface DetailsTabProps {
  modelId: string
  model: ModelData
  onModelChange: (model: ModelData) => void
  onDetailsChange?: (details: ModelDetail[]) => void
  onLinksChange?: (links: ModelLink[]) => void
}

interface ModelDetail {
  id: string
  detail_name: string
  detail_value: string
}

interface ModelLink {
  id: string
  platform: string
  url: string
}

const DETAIL_FIELDS = [
  {
    key: "input_context_length",
    label: "Input context length",
    inputType: "number",
    placeholder: "e.g., 128000",
  },
  {
    key: "output_context_length",
    label: "Output context length",
    inputType: "number",
    placeholder: "e.g., 8192",
  },
  {
    key: "knowledge_cutoff",
    label: "Knowledge cutoff",
    inputType: "date",
    placeholder: "Knowledge cutoff date",
  },
  {
    key: "parameter_count",
    label: "Parameter count",
    inputType: "text",
    placeholder: "e.g., 70000000000",
  },
  {
    key: "training_tokens",
    label: "Training tokens",
    inputType: "text",
    placeholder: "e.g., 13000000000000",
  },
] as const

const LINK_FIELDS = [
  { key: "announcement", label: "Announcement" },
  { key: "api_reference", label: "API reference" },
  { key: "paper", label: "Paper" },
  { key: "playground", label: "Playground" },
  { key: "repository", label: "Repository" },
  { key: "weights", label: "Weights" },
] as const

type DetailFieldKey = (typeof DETAIL_FIELDS)[number]["key"]
type LinkFieldKey = (typeof LINK_FIELDS)[number]["key"]

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
})

const COMPACT_DETAIL_FIELDS = new Set<DetailFieldKey>([
  "parameter_count",
  "training_tokens",
])

function sanitizeDigitInput(value: string): string {
  return value.replace(/[^\d]/g, "")
}

function formatCompactNumberLabel(value: string): string {
  if (!value) return ""
  const normalized = value.replace(/^0+(?=\d)/, "")
  const safe = normalized || "0"
  const numeric = Number(safe)
  if (!Number.isFinite(numeric)) return ""
  return COMPACT_NUMBER_FORMATTER.format(numeric)
}

function createEmptyDetailValues(): Record<DetailFieldKey, string> {
  return {
    input_context_length: "",
    output_context_length: "",
    knowledge_cutoff: "",
    parameter_count: "",
    training_tokens: "",
  }
}

function createEmptyLinkValues(): Record<LinkFieldKey, string> {
  return {
    announcement: "",
    api_reference: "",
    paper: "",
    playground: "",
    repository: "",
    weights: "",
  }
}

export default function DetailsTab({
  modelId,
  model,
  onModelChange,
  onDetailsChange,
  onLinksChange,
}: DetailsTabProps) {
  void model
  void onModelChange

  const [detailValues, setDetailValues] = useState<Record<DetailFieldKey, string>>(createEmptyDetailValues())
  const [linkValues, setLinkValues] = useState<Record<LinkFieldKey, string>>(createEmptyLinkValues())
  const onDetailsChangeRef = useRef(onDetailsChange)
  const onLinksChangeRef = useRef(onLinksChange)

  useEffect(() => {
    onDetailsChangeRef.current = onDetailsChange
  }, [onDetailsChange])

  useEffect(() => {
    onLinksChangeRef.current = onLinksChange
  }, [onLinksChange])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: detailsData } = await supabase
        .from("data_model_details")
        .select("detail_name, detail_value")
        .eq("model_id", modelId)

      const { data: linksData } = await supabase
        .from("data_model_links")
        .select("platform, url")
        .eq("model_id", modelId)

      const nextDetails = createEmptyDetailValues()
      for (const row of detailsData ?? []) {
        const key = row.detail_name as DetailFieldKey
        if (key in nextDetails) {
          nextDetails[key] = row.detail_value?.toString() ?? ""
        }
      }
      setDetailValues(nextDetails)

      const nextLinks = createEmptyLinkValues()
      for (const row of linksData ?? []) {
        const key = row.platform as LinkFieldKey
        if (key in nextLinks) {
          nextLinks[key] = row.url ?? ""
        }
      }
      setLinkValues(nextLinks)
    }

    void fetchData()
  }, [modelId])

  useEffect(() => {
    const payload: ModelDetail[] = DETAIL_FIELDS
      .map((field) => ({
        id: field.key,
        detail_name: field.key,
        detail_value: detailValues[field.key].trim(),
      }))
      .filter((row) => row.detail_value.length > 0)

    onDetailsChangeRef.current?.(payload)
  }, [detailValues])

  useEffect(() => {
    const payload: ModelLink[] = LINK_FIELDS
      .map((field) => ({
        id: field.key,
        platform: field.key,
        url: linkValues[field.key].trim(),
      }))
      .filter((row) => row.url.length > 0)

    onLinksChangeRef.current?.(payload)
  }, [linkValues])

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Model Details</Label>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {DETAIL_FIELDS.map((field) => {
            const isCompactField = COMPACT_DETAIL_FIELDS.has(field.key)
            const compactLabel = isCompactField
              ? formatCompactNumberLabel(detailValues[field.key])
              : ""

            return (
              <label key={field.key} className="text-sm">
                <div className="mb-1 text-muted-foreground">{field.label}</div>
                {field.inputType === "date" ? (
                  <DatePickerInput
                    value={detailValues[field.key]}
                    onChange={(value) =>
                      setDetailValues((prev) => ({
                        ...prev,
                        [field.key]: value,
                      }))
                    }
                    placeholder={field.placeholder}
                  />
                ) : isCompactField ? (
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={detailValues[field.key]}
                      onChange={(event) =>
                        setDetailValues((prev) => ({
                          ...prev,
                          [field.key]: sanitizeDigitInput(event.target.value),
                        }))
                      }
                      placeholder={field.placeholder}
                      className={compactLabel ? "pr-16" : undefined}
                    />
                    {compactLabel ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {compactLabel}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <Input
                    type={field.inputType}
                    value={detailValues[field.key]}
                    onChange={(event) =>
                      setDetailValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                  />
                )}
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <Label className="text-sm font-medium">Model Links</Label>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LINK_FIELDS.map((field) => (
            <label key={field.key} className="text-sm">
              <div className="mb-1 text-muted-foreground">{field.label}</div>
              <Input
                type="url"
                value={linkValues[field.key]}
                onChange={(event) =>
                  setLinkValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
