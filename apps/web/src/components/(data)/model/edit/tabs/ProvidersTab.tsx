"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"
import type { ModelData } from "../ModelEditDialog"

export interface ProviderModelRow {
  id: string
  provider_id: string
  api_model_id: string
  provider_model_slug: string | null
  is_active_gateway: boolean
  input_modalities: string | null
  output_modalities: string | null
  quantization_scheme: string | null
  effective_from: string | null
  effective_to: string | null
}

export interface ProviderCapabilityRow {
  id: string
  provider_row_id: string
  provider_id: string
  api_model_id: string
  capability_id: string
  status: "active" | "deranked" | "disabled"
  max_input_tokens: number | null
  max_output_tokens: number | null
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  params: Record<string, boolean>
}

interface ProvidersTabProps {
  modelId: string
  model: ModelData
  providers: Array<{ id: string; name: string }>
  onProviderModelsChange?: (providerModels: ProviderModelRow[]) => void
  onProviderCapabilitiesChange?: (providerCapabilities: ProviderCapabilityRow[]) => void
}

const MODALITY_OPTIONS = ["text", "image", "audio", "video"] as const

const CAPABILITY_OPTIONS = [
  "text.generate",
  "text.embed",
  "text.moderate",
  "image.generate",
  "image.edit",
  "audio.transcribe",
  "ocr",
  "video.edit",
  "video.generate",
] as const

const CAPABILITY_STATUS_OPTIONS = ["active", "deranked", "disabled"] as const

const PARAMETER_FLAGS = [
  "temperature",
  "top_p",
  "top_k",
  "max_tokens",
  "max_completion_tokens",
  "frequency_penalty",
  "presence_penalty",
  "repetition_penalty",
  "seed",
  "stream",
  "logprobs",
  "stop",
  "tool_choice",
  "parallel_tool_calls",
  "response_format",
  "include_reasoning",
  "reasoning_effort",
  "reasoning_tokens",
  "json_schema",
  "language",
  "timestamp_granularities",
  "audio_format",
]

function sortLabel(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

function parseTypes(types: unknown): string[] {
  if (!types) return []
  if (Array.isArray(types)) {
    return types.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  }
  if (typeof types !== "string") return []
  if (types.startsWith("[")) {
    try {
      const parsed = JSON.parse(types)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      }
    } catch {
      return []
    }
  }
  return types.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
}

function toCsv(value: string[]): string | null {
  const unique = Array.from(new Set(value.map((item) => item.trim().toLowerCase()).filter(Boolean)))
  return unique.length ? unique.join(",") : null
}

function formatDateForPicker(value: string | null): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function createCapabilityId() {
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function capabilityIdentity(providerRowId: string, capabilityId: string) {
  return `${providerRowId}::${capabilityId.trim().toLowerCase()}`
}

function dedupeCapabilities(rows: ProviderCapabilityRow[]): ProviderCapabilityRow[] {
  const seen = new Set<string>()
  const next: ProviderCapabilityRow[] = []
  for (const row of rows) {
    const key = capabilityIdentity(row.provider_row_id, row.capability_id || "")
    if (!row.capability_id || seen.has(key)) continue
    seen.add(key)
    next.push(row)
  }
  return next
}

function defaultCapability(providerRowId: string, providerId: string, apiModelId: string): ProviderCapabilityRow {
  return {
    id: createCapabilityId(),
    provider_row_id: providerRowId,
    provider_id: providerId,
    api_model_id: apiModelId,
    capability_id: "text.generate",
    status: "active",
    max_input_tokens: null,
    max_output_tokens: null,
    effective_from: null,
    effective_to: null,
    notes: null,
    params: {},
  }
}

export default function ProvidersTab({
  modelId,
  model,
  providers,
  onProviderModelsChange,
  onProviderCapabilitiesChange,
}: ProvidersTabProps) {
  const [providerModels, setProviderModels] = useState<ProviderModelRow[]>([])
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilityRow[]>([])
  const onProviderModelsChangeRef = useRef(onProviderModelsChange)
  const onProviderCapabilitiesChangeRef = useRef(onProviderCapabilitiesChange)

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => sortLabel(a.name || a.id, b.name || b.id)),
    [providers]
  )

  const providerNameById = useMemo(
    () => new Map(sortedProviders.map((provider) => [provider.id, provider.name])),
    [sortedProviders]
  )

  const selectedProviderIds = useMemo(
    () => new Set(providerModels.map((row) => row.provider_id)),
    [providerModels]
  )

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: providerModelData } = await supabase
        .from("data_api_provider_models")
        .select("*")
        .eq("internal_model_id", modelId)

      const mappedProviderModels: ProviderModelRow[] = (providerModelData ?? []).map((providerModel: any) => ({
        id: providerModel.provider_api_model_id,
        provider_id: providerModel.provider_id,
        api_model_id: providerModel.api_model_id,
        provider_model_slug: providerModel.provider_model_slug,
        is_active_gateway: providerModel.is_active_gateway ?? false,
        input_modalities: Array.isArray(providerModel.input_modalities)
          ? providerModel.input_modalities.join(",")
          : providerModel.input_modalities,
        output_modalities: Array.isArray(providerModel.output_modalities)
          ? providerModel.output_modalities.join(",")
          : providerModel.output_modalities,
        quantization_scheme: providerModel.quantization_scheme,
        effective_from: providerModel.effective_from,
        effective_to: providerModel.effective_to,
      }))
      setProviderModels(mappedProviderModels)

      const providerModelIds = mappedProviderModels.map((row) => row.id)
      if (!providerModelIds.length) {
        setProviderCapabilities([])
        return
      }

      const { data: capabilityRows } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("id, provider_api_model_id, capability_id, params, status, max_input_tokens, max_output_tokens, effective_from, effective_to, notes")
        .in("provider_api_model_id", providerModelIds)

      const providerById = new Map(mappedProviderModels.map((row) => [row.id, row]))
      const mappedCapabilities: ProviderCapabilityRow[] = (capabilityRows ?? []).flatMap((capability: any) => {
        const providerRow = providerById.get(capability.provider_api_model_id)
        if (!providerRow || !capability.capability_id) return []
        const rawParams = capability.params && typeof capability.params === "object" ? capability.params : {}
        return [{
          id: capability.id ?? `${providerRow.id}:${capability.capability_id}:${createCapabilityId()}`,
          provider_row_id: providerRow.id,
          provider_id: providerRow.provider_id,
          api_model_id: providerRow.api_model_id,
          capability_id: capability.capability_id,
          status:
            capability.status === "disabled" || capability.status === "deranked"
              ? capability.status
              : "active",
          max_input_tokens: capability.max_input_tokens ?? null,
          max_output_tokens: capability.max_output_tokens ?? null,
          effective_from: capability.effective_from ?? null,
          effective_to: capability.effective_to ?? null,
          notes: capability.notes ?? null,
          params: Object.fromEntries(
            Object.entries(rawParams).map(([key, value]) => [key, Boolean(value)])
          ),
        }]
      })
      setProviderCapabilities(dedupeCapabilities(mappedCapabilities))
    }

    void fetchData()
  }, [modelId])

  useEffect(() => {
    onProviderModelsChangeRef.current = onProviderModelsChange
  }, [onProviderModelsChange])

  useEffect(() => {
    onProviderCapabilitiesChangeRef.current = onProviderCapabilitiesChange
  }, [onProviderCapabilitiesChange])

  useEffect(() => {
    onProviderModelsChangeRef.current?.(providerModels)
  }, [providerModels])

  useEffect(() => {
    onProviderCapabilitiesChangeRef.current?.(providerCapabilities)
  }, [providerCapabilities])

  const toggleProvider = (providerId: string) => {
    setProviderModels((prev) => {
      if (prev.some((row) => row.provider_id === providerId)) {
        const remaining = prev.filter((row) => row.provider_id !== providerId)
        const removedIds = new Set(
          prev.filter((row) => row.provider_id === providerId).map((row) => row.id)
        )
        setProviderCapabilities((capabilities) =>
          capabilities.filter((capability) => !removedIds.has(capability.provider_row_id))
        )
        return remaining
      }

      const newRow: ProviderModelRow = {
        id: `new-${providerId}-${Date.now()}`,
        provider_id: providerId,
        api_model_id: model.model_id,
        provider_model_slug: null,
        is_active_gateway: false,
        input_modalities: "text",
        output_modalities: "text",
        quantization_scheme: null,
        effective_from: null,
        effective_to: null,
      }
      setProviderCapabilities((prevCapabilities) => [
        ...prevCapabilities,
        defaultCapability(newRow.id, providerId, newRow.api_model_id),
      ])
      return [...prev, newRow]
    })
  }

  const updateProviderModel = (providerRowId: string, field: keyof ProviderModelRow, value: any) => {
    setProviderModels((prev) =>
      prev.map((row) => (row.id === providerRowId ? { ...row, [field]: value } : row))
    )

    if (field === "provider_id" || field === "api_model_id") {
      setProviderCapabilities((prev) =>
        prev.map((capability) => {
          if (capability.provider_row_id !== providerRowId) return capability
          return {
            ...capability,
            provider_id: field === "provider_id" ? value : capability.provider_id,
            api_model_id: field === "api_model_id" ? value : capability.api_model_id,
          }
        })
      )
    }
  }

  const toggleProviderModality = (
    providerRowId: string,
    field: "input_modalities" | "output_modalities",
    modality: string,
    checked: boolean
  ) => {
    const providerRow = providerModels.find((row) => row.id === providerRowId)
    if (!providerRow) return
    const current = parseTypes(providerRow[field])
    const next = checked
      ? [...new Set([...current, modality])]
      : current.filter((value) => value !== modality)
    updateProviderModel(providerRowId, field, toCsv(next))
  }

  const addCapability = (providerModel: ProviderModelRow) => {
    const existing = new Set(
      providerCapabilities
        .filter((row) => row.provider_row_id === providerModel.id)
        .map((row) => row.capability_id.trim().toLowerCase())
    )
    const firstAvailable = CAPABILITY_OPTIONS.find(
      (capability) => !existing.has(capability)
    )
    if (!firstAvailable) return

    setProviderCapabilities((prev) => [
      ...prev,
      {
        ...defaultCapability(providerModel.id, providerModel.provider_id, providerModel.api_model_id),
        capability_id: firstAvailable,
      },
    ])
  }

  const updateCapability = (
    capabilityId: string,
    updater: (value: ProviderCapabilityRow) => ProviderCapabilityRow
  ) => {
    setProviderCapabilities((prev) => {
      let changed = false
      const next = prev.map((row) => {
        if (row.id !== capabilityId) return row
        changed = true
        return updater(row)
      })
      return changed ? next : prev
    })
  }

  const removeCapability = (capabilityId: string) => {
    setProviderCapabilities((prev) => {
      const next = prev.filter((row) => row.id !== capabilityId)
      return next.length === prev.length ? prev : next
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Provider availability</Label>
          <span className="text-xs text-muted-foreground">A-Z ordered. Grey logos are inactive.</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {sortedProviders.map((provider) => {
            const active = selectedProviderIds.has(provider.id)
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => toggleProvider(provider.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition",
                  active ? "border-primary bg-primary/5" : "bg-muted/40"
                )}
              >
                <div className={cn("flex items-center gap-2", !active && "grayscale opacity-50")}>
                  <Logo id={provider.id} alt={provider.name} width={18} height={18} />
                  <span className="truncate text-xs">{provider.name}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        {providerModels.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Select one or more providers above to attach availability and capabilities.
          </div>
        ) : null}

        {providerModels.map((providerModel) => {
          const providerName = providerNameById.get(providerModel.provider_id) ?? providerModel.provider_id
          const capabilityRows = providerCapabilities.filter(
            (row) => row.provider_row_id === providerModel.id
          )

          return (
            <div key={providerModel.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Logo id={providerModel.provider_id} alt={providerName} width={18} height={18} />
                  <div>
                    <div className="text-sm font-medium">{providerName}</div>
                    <div className="text-xs text-muted-foreground">{providerModel.provider_id}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleProvider(providerModel.provider_id)}
                  aria-label={`Remove ${providerName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Provider API model ID</Label>
                  <Input
                    value={providerModel.api_model_id}
                    onChange={(event) =>
                      updateProviderModel(providerModel.id, "api_model_id", event.target.value)
                    }
                    placeholder="e.g. gpt-4.1-mini"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Provider model slug</Label>
                  <Input
                    value={providerModel.provider_model_slug ?? ""}
                    onChange={(event) =>
                      updateProviderModel(
                        providerModel.id,
                        "provider_model_slug",
                        event.target.value || null
                      )
                    }
                    placeholder="Optional provider slug"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Internal model ID</Label>
                  <Input
                    value={model.model_id}
                    readOnly
                    disabled
                    className="text-xs"
                  />
                </div>
                <label className="flex items-center gap-2 pt-6 text-xs">
                  <Checkbox
                    checked={providerModel.is_active_gateway}
                    onCheckedChange={(checked) =>
                      updateProviderModel(
                        providerModel.id,
                        "is_active_gateway",
                        checked === true
                      )
                    }
                  />
                  Active on gateway
                </label>
              </div>

              <div className="grid gap-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Quantization scheme</Label>
                  <Input
                    value={providerModel.quantization_scheme ?? ""}
                    onChange={(event) =>
                      updateProviderModel(
                        providerModel.id,
                        "quantization_scheme",
                        event.target.value || null
                      )
                    }
                    placeholder="FP16, INT8, etc."
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Effective from</Label>
                  <DatePickerInput
                    value={formatDateForPicker(providerModel.effective_from)}
                    onChange={(nextValue) =>
                      updateProviderModel(
                        providerModel.id,
                        "effective_from",
                        nextValue || null
                      )
                    }
                    placeholder="Effective from"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Effective to</Label>
                  <DatePickerInput
                    value={formatDateForPicker(providerModel.effective_to)}
                    onChange={(nextValue) =>
                      updateProviderModel(
                        providerModel.id,
                        "effective_to",
                        nextValue || null
                      )
                    }
                    placeholder="Effective to"
                  />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Input modalities</Label>
                  <div className="flex flex-wrap gap-2">
                    {MODALITY_OPTIONS.map((modality) => {
                      const enabled = parseTypes(providerModel.input_modalities).includes(modality)
                      return (
                        <label
                          key={`${providerModel.id}-in-${modality}`}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                            enabled && "border-primary bg-primary/10"
                          )}
                        >
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              toggleProviderModality(
                                providerModel.id,
                                "input_modalities",
                                modality,
                                checked === true
                              )
                            }
                          />
                          {modality}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Output modalities</Label>
                  <div className="flex flex-wrap gap-2">
                    {MODALITY_OPTIONS.map((modality) => {
                      const enabled = parseTypes(providerModel.output_modalities).includes(modality)
                      return (
                        <label
                          key={`${providerModel.id}-out-${modality}`}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                            enabled && "border-primary bg-primary/10"
                          )}
                        >
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              toggleProviderModality(
                                providerModel.id,
                                "output_modalities",
                                modality,
                                checked === true
                              )
                            }
                          />
                          {modality}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Capabilities</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addCapability(providerModel)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add capability
                  </Button>
                </div>

                {capabilityRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No capabilities yet for this provider model.
                  </p>
                ) : null}

                {capabilityRows.map((capability) => {
                  const capabilityOptions = Array.from(
                    new Set([...CAPABILITY_OPTIONS, capability.capability_id])
                  )
                  const usedByOther = new Set(
                    capabilityRows
                      .filter((row) => row.id !== capability.id)
                      .map((row) => row.capability_id.trim().toLowerCase())
                  )

                  return (
                    <div key={capability.id} className="space-y-2 rounded-md border p-2">
                      <div className="grid gap-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Capability</Label>
                          <Select
                            value={capability.capability_id}
                            onValueChange={(value) => {
                              if (usedByOther.has(value.trim().toLowerCase())) return
                              updateCapability(capability.id, (row) => ({
                                ...row,
                                capability_id: value,
                              }))
                            }}
                          >
                            <SelectTrigger className="text-xs">
                              <SelectValue placeholder="Select capability" />
                            </SelectTrigger>
                            <SelectContent>
                              {capabilityOptions.map((option) => (
                                <SelectItem
                                  key={option}
                                  value={option}
                                  disabled={usedByOther.has(option.trim().toLowerCase())}
                                >
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <Select
                            value={capability.status}
                            onValueChange={(value) =>
                              updateCapability(capability.id, (row) => ({
                                ...row,
                                status: value as ProviderCapabilityRow["status"],
                              }))
                            }
                          >
                            <SelectTrigger className="text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAPABILITY_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Context length</Label>
                          <Input
                            type="number"
                            value={capability.max_input_tokens ?? ""}
                            onChange={(event) =>
                              updateCapability(capability.id, (row) => ({
                                ...row,
                                max_input_tokens: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }))
                            }
                            placeholder="Max input tokens"
                            className="text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max output tokens</Label>
                          <Input
                            type="number"
                            value={capability.max_output_tokens ?? ""}
                            onChange={(event) =>
                              updateCapability(capability.id, (row) => ({
                                ...row,
                                max_output_tokens: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }))
                            }
                            placeholder="Max output tokens"
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Supported params</Label>
                        <div className="flex flex-wrap gap-2">
                          {PARAMETER_FLAGS.map((param) => {
                            const enabled = Boolean(capability.params[param])
                            return (
                              <Button
                                key={`${capability.id}-${param}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateCapability(capability.id, (row) => ({
                                    ...row,
                                    params: {
                                      ...row.params,
                                      [param]: !enabled,
                                    },
                                  }))
                                }
                                className={cn(
                                  "h-7 px-2 text-xs",
                                  enabled && "border-primary bg-primary/10"
                                )}
                              >
                                {param}
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Capability notes</Label>
                          <Input
                            value={capability.notes ?? ""}
                            onChange={(event) =>
                              updateCapability(capability.id, (row) => ({
                                ...row,
                                notes: event.target.value || null,
                              }))
                            }
                            placeholder="Optional note"
                            className="text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCapability(capability.id)}
                          aria-label="Remove capability"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
