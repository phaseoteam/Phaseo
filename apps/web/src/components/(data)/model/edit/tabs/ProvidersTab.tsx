"use client"

import Link from "next/link"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { Plus, ArrowRight } from "lucide-react"
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
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { fetchAdminModelEditorSource, fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"
import {
  PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
  PROVIDER_PROMPT_TRAINING_POLICY_VALUES,
  type ProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy"
import {
  CAPABILITY_STATUS_OPTIONS,
  editorOptionLabel,
  QUANTIZATION_OPTIONS,
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
  onSave?: () => Promise<void>
  saving?: boolean
  saveError?: string | null
  savedMessage?: string | null
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
    id: `new-${createCapabilityId()}`,
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
    <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)] md:items-start">
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
  onSave, saving = false, saveError, savedMessage,
  providers,
  focusProviderId,
  onProviderModelsChange,
  onProviderCapabilitiesChange,
}: ProvidersTabProps) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [routeQuery, setRouteQuery] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [providerModels, setProviderModels] = useState<ProviderModelRow[]>([])
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilityRow[]>([])
  const [modelNames, setModelNames] = useState<Record<string, string>>({})
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

  const matchingProviderModels = visibleProviderModels.filter((row) => `${providerNameById.get(row.provider_id)} ${row.provider_id} ${row.provider_model_slug || ""}`.toLowerCase().includes(routeQuery.trim().toLowerCase()))
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

      setModelNames(Object.fromEntries([...modelRows.map((row: any) => [row.model_id, row.name || row.model_id.split("/").pop()]), [modelId, source.model?.name || modelId.split("/").pop()]]))
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

    void fetchData().catch((error) => setLoadError(error instanceof Error ? error.message : "Unable to load providers")).finally(() => setLoading(false))
  }, [modelId])

  useEffect(() => {
    onProviderModelsChangeRef.current = onProviderModelsChange
  }, [onProviderModelsChange])

  useEffect(() => {
    onProviderCapabilitiesChangeRef.current = onProviderCapabilitiesChange
  }, [onProviderCapabilitiesChange])

  useEffect(() => {
    if (!loading && !loadError) onProviderModelsChangeRef.current?.(providerModels)
  }, [providerModels, loading, loadError])

  useEffect(() => {
    if (!loading && !loadError) onProviderCapabilitiesChangeRef.current?.(providerCapabilities)
  }, [providerCapabilities, loading, loadError])

  const toggleProvider = (providerId: string) => {
    const prev = providerModels
      if (prev.some((row) => row.provider_id === providerId)) return

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
      setProviderModels((rows) => [...rows, newRow])
      setSelectedRowId(newRow.id)
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
    setProviderCapabilities((rows) => rows.map((row) => row.id === capabilityId ? { ...row, effective_to: new Date().toISOString() } : row))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Filter connected providers" placeholder="Find a connected provider…" className="min-h-11 sm:flex-1" value={routeQuery} onChange={(event) => setRouteQuery(event.target.value)} />
        <div className="sm:w-64"><SearchableSelect label="Add provider" placeholder="Add provider…" value="" disabled={loading || saving} options={visibleProviderOptions.filter((provider) => !selectedProviderIds.has(provider.id)).map((provider) => ({ value: provider.id, label: provider.name, icon: <Logo id={provider.id} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} onValueChange={toggleProvider} /></div>
      </div>
      {loading ? <p role="status">Loading providers…</p> : loadError ? <p role="alert">{loadError}</p> : <div className="divide-y border-y">
        {matchingProviderModels.map((row) => <Button type="button" key={row.id} variant="ghost" className="h-auto min-h-20 w-full justify-start whitespace-normal rounded-none px-2 py-4 text-left" onClick={() => setSelectedRowId(row.id)}>
          <Logo id={row.provider_id} width={24} height={24} />
          <div className="min-w-0 flex-1"><div className="font-medium">{providerNameById.get(row.provider_id) || row.provider_id}</div><p className="mt-1 break-all text-xs font-normal text-muted-foreground">{row.provider_model_slug || row.api_model_id}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{providerCapabilities.filter((capability) => capability.provider_row_id === row.id).length} capabilities{row.context_length ? ` · ${row.context_length.toLocaleString()} context` : ""}</p></div>
          <Badge variant="outline">{row.is_active_gateway ? "Gateway on" : "Gateway off"}</Badge><ArrowRight className="size-4 shrink-0" />
        </Button>)}
        {visibleProviderModels.length > 0 && !matchingProviderModels.length ? <p className="py-8 text-center text-sm text-muted-foreground">No matching providers.</p> : null}
        {!visibleProviderModels.length ? <p className="py-8 text-center text-sm text-muted-foreground">No connected providers. Choose Add provider to get started.</p> : null}
      </div>}
      <Sheet open={selectedRowId !== null} onOpenChange={(open) => { if (!open && !saving) setSelectedRowId(null); }}>
        <SheetContent inert={saving} className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" showCloseButton={!saving}>
        {visibleProviderModels.filter((row) => row.id === selectedRowId).map((providerModel) => {
          const providerName = providerNameById.get(providerModel.provider_id) ?? providerModel.provider_id
          const capabilityRows = providerCapabilities.filter(
            (row) => row.provider_row_id === providerModel.id
          )

          return (
            <div key={providerModel.id} className="flex min-h-0 flex-1 flex-col">
              <SheetHeader className="border-b pr-14"><SheetTitle className="flex items-center gap-3"><Logo id={providerModel.provider_id} alt="" width={24} height={24} className="size-6 object-contain" />{providerName}</SheetTitle><SheetDescription>{providerModel.provider_model_slug || providerModel.api_model_id}</SheetDescription><Link className="text-sm text-primary hover:underline" href={`/internal/data/models/edit/${modelId}?tab=pricing&provider=${encodeURIComponent(providerModel.provider_id)}&routing=1`}>Regional routing settings</Link></SheetHeader>
              <fieldset disabled={saving} className="min-h-0 flex-1 overflow-y-auto p-5 [&_input]:min-h-11">
              <Tabs defaultValue="route">
                <TabsList className="mb-4 w-full"><TabsTrigger value="route">Route</TabsTrigger><TabsTrigger value="capabilities">Capabilities</TabsTrigger><TabsTrigger value="policy">Data policy</TabsTrigger></TabsList>
                <TabsContent value="route" className="space-y-5">
              <FieldRow
                label="Public model"
                description="Choose a model from the catalog."
              >
                <SearchableSelect label="Public model" value={providerModel.api_model_id} options={selectableModelIds.map((value) => ({ value, label: modelNames[value] || value.split("/").pop() || "Unnamed model", icon: <Logo id={value.split("/")[0]} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} onValueChange={(value) => updateProviderModel(providerModel.id, "api_model_id", value)} />
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
                <SearchableSelect label="Quantization scheme" value={providerModel.quantization_scheme || "__unknown__"} options={[{ value: "__unknown__", label: "Not specified" }, ...Array.from(new Set([...QUANTIZATION_OPTIONS, ...(providerModel.quantization_scheme ? [providerModel.quantization_scheme] : [])])).map((value) => ({ value, label: value.toUpperCase() }))]} onValueChange={(value) => updateProviderModel(providerModel.id, "quantization_scheme", value === "__unknown__" ? null : value)} />
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

                </TabsContent>
                <TabsContent value="policy" className="space-y-5">
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
                    <SelectValue>{providerModel.prompt_training_policy_override ? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[providerModel.prompt_training_policy_override] : "Provider default"}</SelectValue>
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

                </TabsContent>
                <TabsContent value="capabilities" className="space-y-4">

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

                <Accordion type="single" collapsible>
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
                    <AccordionItem value={capability.id} key={capability.id}><AccordionTrigger>{editorOptionLabel(capability.capability_id)} · {capability.effective_to ? "End-dated" : editorOptionLabel(capability.status)}</AccordionTrigger><AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-muted-foreground">
                          Edit capability
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={Boolean(capability.effective_to)}
                          onClick={() => removeCapability(capability.id)}
                          aria-label="End-date capability"
                        >
                          End now
                        </Button>
                      </div>

                      <FieldRow label="Capability">
                        <SearchableSelect label="Capability" disabled={!capability.id.startsWith("new-")} value={capability.capability_id} options={capabilityOptions.map((value) => ({ value, label: editorOptionLabel(value), disabled: usedByOther.has(value.trim().toLowerCase()) }))} onValueChange={(value) => updateCapability(capability.id, (row) => ({ ...row, capability_id: value }))} />
                      </FieldRow>

                      <FieldRow label="Support dates"><div className="grid gap-2 sm:grid-cols-2"><DatePickerInput value={formatDateForPicker(capability.effective_from)} onChange={(value) => updateCapability(capability.id, (row) => ({ ...row, effective_from: value || null }))} placeholder="Starts" /><DatePickerInput value={formatDateForPicker(capability.effective_to)} onChange={(value) => updateCapability(capability.id, (row) => ({ ...row, effective_to: value || null }))} placeholder="Ends" /></div></FieldRow>
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
                            <SelectValue>{editorOptionLabel(capability.status)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {CAPABILITY_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>
                                {editorOptionLabel(status)}
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

                    </AccordionContent></AccordionItem>
                  )
                })}
                </Accordion>
                </TabsContent>
              </Tabs>
              </fieldset>
              <SheetFooter className="border-t p-4">
                {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : savedMessage ? <p role="status" className="text-sm text-muted-foreground">{savedMessage}</p> : <p className="text-xs text-muted-foreground">Changes are saved with all providers for this model.</p>}
                <div className="flex justify-between gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { updateProviderModel(providerModel.id, "effective_to", new Date().toISOString()); }}>End support now</Button><Button type="button" disabled={saving} onClick={() => void onSave?.()}>{saving ? "Saving…" : "Save providers"}</Button></div>
              </SheetFooter>
            </div>
          )
        })}
        </SheetContent>
      </Sheet>
    </div>
  )
}
