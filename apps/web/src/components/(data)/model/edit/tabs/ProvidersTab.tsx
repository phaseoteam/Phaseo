"use client"

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
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
import { fetchAdminModelEditorSource, fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"
import {
  PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
  PROVIDER_PROMPT_TRAINING_POLICY_VALUES,
  type ProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy"
import {
  CAPABILITY_STATUS_OPTIONS,
  MODEL_CAPABILITY_OPTIONS,
  MODEL_MODALITY_OPTIONS,
  normalizeCapabilityStatus,
} from "@/lib/models/editorOptions"

export interface ProviderModelRow {
  id: string
  provider_id: string
  api_model_id: string
  provider_model_slug: string | null
  prompt_training_policy_override: ProviderPromptTrainingPolicy | null
  prompt_training_override_notes: string | null
  prompt_training_override_source_url: string | null
  is_active_gateway: boolean
  input_modalities: string | null
  output_modalities: string | null
  quantization_scheme: string | null
  context_length: number | null
  max_output_tokens: number | null
  effective_from: string | null
  effective_to: string | null
}

export interface ProviderCapabilityRow {
  id: string
  provider_row_id: string
  provider_id: string
  api_model_id: string
  capability_id: string
  status:
    | "active"
    | "deranked_lvl1"
    | "deranked_lvl2"
    | "deranked_lvl3"
    | "disabled"
  effective_from: string | null
  effective_to: string | null
  params: Record<string, boolean>
}

interface ProvidersTabProps {
  modelId: string
  providers: Array<{ id: string; name: string }>
  focusProviderId?: string
  onProviderModelsChange?: (providerModels: ProviderModelRow[]) => void
  onProviderCapabilitiesChange?: (providerCapabilities: ProviderCapabilityRow[]) => void
}

const MODALITY_OPTIONS = MODEL_MODALITY_OPTIONS

const CAPABILITY_OPTIONS = MODEL_CAPABILITY_OPTIONS

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
    effective_from: null,
    effective_to: null,
    params: {},
  }
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  )
}

export default function ProvidersTab({
  modelId,
  providers,
  focusProviderId,
  onProviderModelsChange,
  onProviderCapabilitiesChange,
}: ProvidersTabProps) {
  const [providerModels, setProviderModels] = useState<ProviderModelRow[]>([])
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilityRow[]>([])
  const [availableModelIds, setAvailableModelIds] = useState<string[]>([])
  const onProviderModelsChangeRef = useRef(onProviderModelsChange)
  const onProviderCapabilitiesChangeRef = useRef(onProviderCapabilitiesChange)

  const sortedProviders = useMemo(() => {
    const next = [...providers].sort((a, b) => sortLabel(a.name || a.id, b.name || b.id))
    if (!focusProviderId) return next
    return next.sort((a, b) => {
      if (a.id === focusProviderId) return -1
      if (b.id === focusProviderId) return 1
      return 0
    })
  }, [providers, focusProviderId])

  const providerNameById = useMemo(
    () => new Map(sortedProviders.map((provider) => [provider.id, provider.name])),
    [sortedProviders]
  )

  const selectedProviderIds = useMemo(
    () => new Set(providerModels.map((row) => row.provider_id)),
    [providerModels]
  )

  const visibleProviderOptions = useMemo(() => {
    if (!focusProviderId) return sortedProviders
    return sortedProviders.filter((provider) => provider.id === focusProviderId)
  }, [sortedProviders, focusProviderId])

  const visibleProviderModels = useMemo(() => {
    if (!focusProviderId) return providerModels
    return providerModels.filter((row) => row.provider_id === focusProviderId)
  }, [providerModels, focusProviderId])

  const selectableModelIds = useMemo(() => {
    const merged = new Set<string>([modelId])
    for (const value of availableModelIds) merged.add(value)
    for (const row of providerModels) {
      if (row.api_model_id?.trim()) merged.add(row.api_model_id.trim())
    }
    return Array.from(merged).sort(sortLabel)
  }, [availableModelIds, modelId, providerModels])

  useEffect(() => {
    const fetchData = async () => {
      const [source, options] = await Promise.all([fetchAdminModelEditorSource(modelId), fetchAdminModelFormOptions()])
      const providerModelData = source.providerRows ?? []
      const modelRows = options.previousModels ?? []

      setAvailableModelIds(
        (modelRows ?? [])
          .map((row: any) => (typeof row?.model_id === "string" ? row.model_id.trim() : ""))
          .filter(Boolean)
      )

      const mappedProviderModels: ProviderModelRow[] = (providerModelData ?? []).map((providerModel: any) => ({
        id: providerModel.provider_api_model_id,
        provider_id: providerModel.provider_id,
        api_model_id: providerModel.api_model_id ?? modelId,
        provider_model_slug: providerModel.provider_model_slug,
        prompt_training_policy_override: providerModel.prompt_training_policy_override ?? null,
        prompt_training_override_notes: providerModel.prompt_training_override_notes ?? null,
        prompt_training_override_source_url: providerModel.prompt_training_override_source_url ?? null,
        is_active_gateway: providerModel.is_active_gateway ?? false,
        input_modalities: Array.isArray(providerModel.input_modalities)
          ? providerModel.input_modalities.join(",")
          : providerModel.input_modalities,
        output_modalities: Array.isArray(providerModel.output_modalities)
          ? providerModel.output_modalities.join(",")
          : providerModel.output_modalities,
        quantization_scheme: providerModel.quantization_scheme,
        context_length: providerModel.context_length ?? null,
        max_output_tokens: providerModel.max_output_tokens ?? null,
        effective_from: providerModel.effective_from,
        effective_to: providerModel.effective_to,
      }))
      setProviderModels(mappedProviderModels)

      const providerModelIds = mappedProviderModels.map((row) => row.id)
      if (!providerModelIds.length) {
        setProviderCapabilities([])
        return
      }

      const capabilityRows = providerModelData.flatMap((row: any) =>
        (row.data_api_provider_model_capabilities ?? []).map((capability: any) => ({ ...capability, provider_api_model_id: row.provider_api_model_id }))
	  )

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
          status: normalizeCapabilityStatus(capability.status),
          effective_from: capability.effective_from ?? null,
          effective_to: capability.effective_to ?? null,
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
        api_model_id: modelId,
        provider_model_slug: null,
        prompt_training_policy_override: null,
        prompt_training_override_notes: null,
        prompt_training_override_source_url: null,
        is_active_gateway: false,
        input_modalities: "text",
        output_modalities: "text",
        quantization_scheme: null,
        context_length: null,
        max_output_tokens: null,
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
          const providerModel = providerModels.find((row) => row.id === providerRowId)
          const nextProviderId =
            field === "provider_id" ? String(value) : providerModel?.provider_id ?? capability.provider_id
          const nextApiModelId =
            field === "api_model_id" ? String(value) : providerModel?.api_model_id ?? capability.api_model_id
          return {
            ...capability,
            provider_id: nextProviderId,
            api_model_id: nextApiModelId,
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
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Provider Availability</Label>
          <span className="text-xs text-muted-foreground">
            {focusProviderId
              ? `Focused on provider: ${focusProviderId}`
              : "A-Z ordered. Grey logos are inactive."}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {visibleProviderOptions.map((provider) => {
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
      </section>

      <div className="space-y-4">
        {visibleProviderModels.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {focusProviderId
              ? "This provider is not attached yet. Click the provider above to add it."
              : "Select one or more providers above to attach availability and capabilities."}
          </div>
        ) : null}

        {visibleProviderModels.map((providerModel) => {
          const providerName = providerNameById.get(providerModel.provider_id) ?? providerModel.provider_id
          const capabilityRows = providerCapabilities.filter(
            (row) => row.provider_row_id === providerModel.id
          )

          return (
            <section key={providerModel.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Logo id={providerModel.provider_id} alt={providerName} width={18} height={18} />
                  <div>
                    <div className="text-sm font-semibold">{providerName}</div>
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

              <FieldRow
                label="Public model ID"
                description="Select from known model IDs or enter one manually."
              >
                <div>
                  <Input
                    list={`model-id-options-${providerModel.id}`}
                    value={providerModel.api_model_id}
                    onChange={(event) =>
                      updateProviderModel(
                        providerModel.id,
                        "api_model_id",
                        event.target.value.trim()
                      )
                    }
                    placeholder="organisation/model-id"
                  />
                  <datalist id={`model-id-options-${providerModel.id}`}>
                    {selectableModelIds.map((candidateModelId) => (
                      <option key={`${providerModel.id}-${candidateModelId}`} value={candidateModelId} />
                    ))}
                  </datalist>
                </div>
              </FieldRow>

              <FieldRow label="Provider model ID">
                <Input
                  value={providerModel.provider_model_slug ?? ""}
                  onChange={(event) =>
                    updateProviderModel(
                      providerModel.id,
                      "provider_model_slug",
                      event.target.value || null
                    )
                  }
                  placeholder="Provider-specific model id/slug"
                />
              </FieldRow>

              <FieldRow label="Internal model ID">
                <Input value={modelId} readOnly disabled />
              </FieldRow>

              <FieldRow label="Gateway active">
                <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
              </FieldRow>

              <FieldRow label="Quantization scheme">
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
                />
              </FieldRow>

              <FieldRow label="Context and output limits">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    type="number"
                    value={providerModel.context_length ?? ""}
                    onChange={(event) =>
                      updateProviderModel(
                        providerModel.id,
                        "context_length",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    placeholder="Input context length"
                  />
                  <Input
                    type="number"
                    value={providerModel.max_output_tokens ?? ""}
                    onChange={(event) =>
                      updateProviderModel(
                        providerModel.id,
                        "max_output_tokens",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    placeholder="Max output tokens"
                  />
                </div>
              </FieldRow>

              <FieldRow
                label="Prompt training override"
                description="Leave as Provider default unless this model/provider mapping differs."
              >
                <Select
                  value={providerModel.prompt_training_policy_override ?? "__provider_default"}
                  onValueChange={(value) =>
                    updateProviderModel(
                      providerModel.id,
                      "prompt_training_policy_override",
                      value === "__provider_default" ? null : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Provider default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__provider_default">Provider default</SelectItem>
                    {PROVIDER_PROMPT_TRAINING_POLICY_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PROVIDER_PROMPT_TRAINING_POLICY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Effective window">
                <div className="grid gap-2 sm:grid-cols-2">
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
              </FieldRow>

              <FieldRow label="Input modalities">
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
              </FieldRow>

              <FieldRow label="Output modalities">
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
              </FieldRow>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Capabilities</Label>
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

                {capabilityRows.map((capability, index) => {
                  const capabilityOptions = Array.from(
                    new Set([...CAPABILITY_OPTIONS, capability.capability_id])
                  )
                  const usedByOther = new Set(
                    capabilityRows
                      .filter((row) => row.id !== capability.id)
                      .map((row) => row.capability_id.trim().toLowerCase())
                  )

                  return (
                    <div key={capability.id} className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-muted-foreground">
                          Capability {index + 1}
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

                      <FieldRow label="Capability">
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
                          <SelectTrigger>
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
                      </FieldRow>

                      <FieldRow label="Status">
                        <Select
                          value={capability.status}
                          onValueChange={(value) =>
                            updateCapability(capability.id, (row) => ({
                              ...row,
                              status: value as ProviderCapabilityRow["status"],
                            }))
                          }
                        >
                          <SelectTrigger>
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
                      </FieldRow>

                      <FieldRow
                        label="Supported params"
                        description="Toggle known request parameters supported by this capability."
                      >
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
                      </FieldRow>

                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
