"use client"

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { Copy, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { deletePricingRule } from "@/app/(dashboard)/models/actions"
import { PRICING_METER_OPTIONS } from "@/lib/pricing/meters"
import { createClient } from "@/utils/supabase/client"

type ApplyMode = "and" | "or"
type ValueType = "text" | "number" | "list"

interface PricingCondition {
  id: string
  path: string
  op: string
  value_type: ValueType
  value_text: string
  value_number: string
  value_list: string
  apply: ApplyMode
  group: string
  note: string
}

export interface PricingRulePayload {
  id: string
  model_key: string
  provider_id: string
  api_model_id: string
  capability_id: string
  pricing_plan: string
  meter: string
  unit: string
  unit_size: number
  price_per_unit: number
  currency: string
  note: string | null
  priority: number
  effective_from: string | null
  effective_to: string | null
  match: Array<{
    path: string
    op: string
    value?: unknown
    and_index?: number
    or_group?: number
    note?: string
  }>
}

interface PricingRuleEditor {
  id: string
  provider_id: string
  api_model_id: string
  capability_id: string
  pricing_plan: string
  meter: string
  unit: string
  unit_size: string
  price_per_unit: string
  currency: string
  note: string
  priority: string
  effective_from: string
  effective_to: string
  conditions: PricingCondition[]
}

interface PricingTabProps {
  modelId: string
  onPricingRulesChange?: (pricingRules: PricingRulePayload[]) => void
}

interface ProviderModelRef {
  provider_api_model_id: string
  provider_id: string
  api_model_id: string
}

const PRICING_PLANS = [
  { value: "standard", label: "Standard" },
  { value: "batch", label: "Batch" },
  { value: "flex", label: "Flex" },
  { value: "priority", label: "Priority" },
] as const

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

const OP_OPTIONS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "starts_with",
  "ends_with",
] as const

const METER_DEFAULTS: Record<string, { unit: string; unit_size: number }> = {
  input_text_tokens: { unit: "token", unit_size: 1_000_000 },
  output_text_tokens: { unit: "token", unit_size: 1_000_000 },
  cached_read_text_tokens: { unit: "token", unit_size: 1_000_000 },
  cached_write_text_tokens: { unit: "token", unit_size: 1_000_000 },
  input_image_tokens: { unit: "token", unit_size: 1_000_000 },
  output_image_tokens: { unit: "token", unit_size: 1_000_000 },
  cached_read_image_tokens: { unit: "token", unit_size: 1_000_000 },
  input_audio_tokens: { unit: "token", unit_size: 1_000_000 },
  output_audio_tokens: { unit: "token", unit_size: 1_000_000 },
  cached_read_audio_tokens: { unit: "token", unit_size: 1_000_000 },
  output_image: { unit: "image", unit_size: 1 },
  input_image: { unit: "image", unit_size: 1 },
  output_video_seconds: { unit: "second", unit_size: 1 },
  input_video_seconds: { unit: "second", unit_size: 1 },
  requests: { unit: "request", unit_size: 1 },
}

const pairKey = (providerId: string, apiModelId: string) =>
  `${providerId}::${apiModelId}`

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function sortLabel(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

function parseModelKey(modelKey: string): {
  provider: string
  apiModel: string
  capability: string
} {
  const [provider = "", apiModel = "", ...rest] = modelKey.split(":")
  return { provider, apiModel, capability: rest.join(":") || "text.generate" }
}

function buildModelKey(providerId: string, apiModelId: string, capabilityId: string) {
  return `${providerId}:${apiModelId}:${capabilityId || "text.generate"}`
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`
}

function defaultCondition(): PricingCondition {
  return {
    id: createId("condition"),
    path: "",
    op: "eq",
    value_type: "text",
    value_text: "",
    value_number: "",
    value_list: "",
    apply: "and",
    group: "",
    note: "",
  }
}

function fromStoredMatch(match: unknown): PricingCondition[] {
  if (!Array.isArray(match)) return []
  return match.map((row: any, index) => {
    const value = row?.value
    const isList = Array.isArray(value)
    const isNumber = typeof value === "number"
    return {
      id: createId(`condition-${index}`),
      path: typeof row?.path === "string" ? row.path : "",
      op: typeof row?.op === "string" ? row.op : "eq",
      value_type: isList ? "list" : isNumber ? "number" : "text",
      value_text: !isList && !isNumber ? String(value ?? "") : "",
      value_number: isNumber ? String(value) : "",
      value_list: isList ? value.map((item: unknown) => String(item)).join(",") : "",
      apply: typeof row?.or_group === "number" ? "or" : "and",
      group:
        typeof row?.or_group === "number"
          ? String(row.or_group)
          : typeof row?.and_index === "number"
            ? String(row.and_index)
            : "",
      note: typeof row?.note === "string" ? row.note : "",
    }
  })
}

function parseListValue(raw: string): unknown[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean)
}

function toPayload(rule: PricingRuleEditor): PricingRulePayload {
  const match = rule.conditions
    .map((condition, index) => {
      const path = condition.path.trim()
      if (!path) return null

      const group = Number(condition.group)
      const payload: PricingRulePayload["match"][number] = {
        path,
        op: condition.op || "eq",
        value:
          condition.value_type === "number"
            ? condition.value_number.trim() === ""
              ? null
              : Number(condition.value_number)
            : condition.value_type === "list"
              ? parseListValue(condition.value_list)
              : condition.value_text.trim(),
      }

      if (!Number.isNaN(group)) {
        if (condition.apply === "or") payload.or_group = group
        else payload.and_index = group
      } else if (condition.apply === "and") {
        payload.and_index = index
      }

      if (condition.note.trim()) payload.note = condition.note.trim()
      return payload
    })
    .filter((item): item is PricingRulePayload["match"][number] => Boolean(item))

  const unitSize = Number(rule.unit_size)
  const price = Number(rule.price_per_unit)
  const priority = Number(rule.priority)

  return {
    id: rule.id,
    model_key: buildModelKey(rule.provider_id, rule.api_model_id, rule.capability_id),
    provider_id: rule.provider_id,
    api_model_id: rule.api_model_id,
    capability_id: rule.capability_id || "text.generate",
    pricing_plan: rule.pricing_plan || "standard",
    meter: rule.meter,
    unit: rule.unit || "token",
    unit_size: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
    price_per_unit: Number.isFinite(price) ? price : 0,
    currency: rule.currency || "USD",
    note: rule.note.trim() || null,
    priority: Number.isFinite(priority) ? priority : 100,
    effective_from: rule.effective_from || null,
    effective_to: rule.effective_to || null,
    match,
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

export default function PricingTab({ modelId, onPricingRulesChange }: PricingTabProps) {
  const [pricingRules, setPricingRules] = useState<PricingRuleEditor[]>([])
  const [providerModels, setProviderModels] = useState<ProviderModelRef[]>([])
  const [providerNames, setProviderNames] = useState<Record<string, string>>({})
  const [capabilityByPair, setCapabilityByPair] = useState<Record<string, string[]>>({})
  const onPricingRulesChangeRef = useRef(onPricingRulesChange)

  const providerPairOptions = useMemo(() => {
    const pairs = Array.from(
      new Map(providerModels.map((row) => [pairKey(row.provider_id, row.api_model_id), row])).values()
    )
    return pairs.sort((a, b) => {
      const nameA = providerNames[a.provider_id] ?? a.provider_id
      const nameB = providerNames[b.provider_id] ?? b.provider_id
      const first = sortLabel(nameA, nameB)
      return first !== 0 ? first : sortLabel(a.api_model_id, b.api_model_id)
    })
  }, [providerModels, providerNames])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: providerModelRows } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, api_model_id")
        .eq("internal_model_id", modelId)
      const providerModelData = (providerModelRows ?? []) as ProviderModelRef[]
      setProviderModels(providerModelData)

      const providerIds = Array.from(new Set(providerModelData.map((row) => row.provider_id)))
      if (providerIds.length > 0) {
        const { data: providerRows } = await supabase
          .from("data_api_providers")
          .select("api_provider_id, api_provider_name")
          .in("api_provider_id", providerIds)
        setProviderNames(
          Object.fromEntries(
            (providerRows ?? []).map((row: any) => [
              row.api_provider_id,
              row.api_provider_name ?? row.api_provider_id,
            ])
          )
        )
      } else {
        setProviderNames({})
      }

      const providerByApiModelId = new Map(
        providerModelData.map((row) => [row.provider_api_model_id, row])
      )

      if (providerByApiModelId.size > 0) {
        const { data: capabilityRows } = await supabase
          .from("data_api_provider_model_capabilities")
          .select("provider_api_model_id, capability_id")
          .in("provider_api_model_id", Array.from(providerByApiModelId.keys()))

        const nextMap = new Map<string, Set<string>>()
        for (const row of capabilityRows ?? []) {
          const providerModel = providerByApiModelId.get((row as any).provider_api_model_id)
          if (!providerModel || !(row as any).capability_id) continue
          const key = pairKey(providerModel.provider_id, providerModel.api_model_id)
          const set = nextMap.get(key) ?? new Set<string>()
          set.add((row as any).capability_id)
          nextMap.set(key, set)
        }

        setCapabilityByPair(
          Object.fromEntries(
            Array.from(nextMap.entries()).map(([key, set]) => [key, Array.from(set).sort(sortLabel)])
          )
        )
      } else {
        setCapabilityByPair({})
      }

      const validPairs = new Set(
        providerModelData.map((row) => `${row.provider_id}:${row.api_model_id}`)
      )
      const { data: pricingRows } = await supabase
        .from("data_api_pricing_rules")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(5000)

      setPricingRules(
        (pricingRows ?? [])
          .filter((row: any) => {
            const parsed = parseModelKey(row.model_key ?? "")
            return validPairs.has(`${parsed.provider}:${parsed.apiModel}`) || parsed.apiModel === modelId
          })
          .map((row: any) => {
            const parsed = parseModelKey(row.model_key ?? "")
            return {
              id: row.rule_id,
              provider_id: parsed.provider,
              api_model_id: parsed.apiModel,
              capability_id: row.capability_id ?? parsed.capability,
              pricing_plan: row.pricing_plan ?? "standard",
              meter: row.meter ?? (PRICING_METER_OPTIONS[0]?.value ?? ""),
              unit: row.unit ?? "token",
              unit_size: String(row.unit_size ?? 1),
              price_per_unit: String(row.price_per_unit ?? 0),
              currency: row.currency ?? "USD",
              note: row.note ?? "",
              priority: String(row.priority ?? 100),
              effective_from: toDateInput(row.effective_from),
              effective_to: toDateInput(row.effective_to),
              conditions: fromStoredMatch(row.match),
            }
          })
      )
    }

    void fetchData()
  }, [modelId])

  const pricingPayload = useMemo(() => pricingRules.map((rule) => toPayload(rule)), [pricingRules])

  useEffect(() => {
    onPricingRulesChangeRef.current = onPricingRulesChange
  }, [onPricingRulesChange])

  useEffect(() => {
    onPricingRulesChangeRef.current?.(pricingPayload)
  }, [pricingPayload])

  const setRuleField = (id: string, field: keyof PricingRuleEditor, value: string) =>
    setPricingRules((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        if (field !== "meter") return { ...row, [field]: value }
        const defaults = METER_DEFAULTS[value]
        return {
          ...row,
          meter: value,
          unit: defaults?.unit ?? row.unit,
          unit_size: defaults ? String(defaults.unit_size) : row.unit_size,
        }
      })
    )

  const setRulePair = (id: string, selectedPair: string) => {
    const idx = selectedPair.indexOf("::")
    if (idx < 0) return
    const provider_id = selectedPair.slice(0, idx)
    const api_model_id = selectedPair.slice(idx + 2)
    setPricingRules((prev) =>
      prev.map((row) => (row.id === id ? { ...row, provider_id, api_model_id } : row))
    )
  }

  const addRule = () => {
    const firstPair = providerPairOptions[0]
    const provider_id = firstPair?.provider_id ?? ""
    const api_model_id = firstPair?.api_model_id ?? modelId
    const capability_id =
      capabilityByPair[pairKey(provider_id, api_model_id)]?.[0] ?? CAPABILITY_OPTIONS[0]
    const defaultMeter = PRICING_METER_OPTIONS[0]?.value ?? ""
    const defaults = METER_DEFAULTS[defaultMeter]
    setPricingRules((prev) => [
      ...prev,
      {
        id: createId("new-rule"),
        provider_id,
        api_model_id,
        capability_id,
        pricing_plan: "standard",
        meter: defaultMeter,
        unit: defaults?.unit ?? "token",
        unit_size: String(defaults?.unit_size ?? 1),
        price_per_unit: "0",
        currency: "USD",
        note: "",
        priority: "100",
        effective_from: "",
        effective_to: "",
        conditions: [],
      },
    ])
  }

  const duplicateRule = (id: string) =>
    setPricingRules((prev) => {
      const existing = prev.find((row) => row.id === id)
      if (!existing) return prev
      return [...prev, { ...existing, id: createId("new-rule") }]
    })

  const removeRule = async (id: string) => {
    if (!id.startsWith("new-")) {
      try {
        await deletePricingRule(id)
      } catch (error) {
        console.error("Error deleting pricing rule:", error)
        return
      }
    }
    setPricingRules((prev) => prev.filter((row) => row.id !== id))
  }

  const addCondition = (ruleId: string) =>
    setPricingRules((prev) =>
      prev.map((row) =>
        row.id === ruleId
          ? { ...row, conditions: [...row.conditions, defaultCondition()] }
          : row
      )
    )

  const setConditionField = (
    ruleId: string,
    conditionId: string,
    field: keyof PricingCondition,
    value: string
  ) =>
    setPricingRules((prev) =>
      prev.map((row) =>
        row.id !== ruleId
          ? row
          : {
              ...row,
              conditions: row.conditions.map((condition) =>
                condition.id === conditionId ? { ...condition, [field]: value } : condition
              ),
            }
      )
    )

  const removeCondition = (ruleId: string, conditionId: string) =>
    setPricingRules((prev) =>
      prev.map((row) =>
        row.id === ruleId
          ? {
              ...row,
              conditions: row.conditions.filter((condition) => condition.id !== conditionId),
            }
          : row
      )
    )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Pricing Rules</Label>
          <p className="text-xs text-muted-foreground">
            Build rule-based pricing by provider model, capability, and optional conditions.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus className="mr-1 h-4 w-4" />
          Add pricing rule
        </Button>
      </div>

      {pricingRules.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No pricing rules yet.
        </div>
      ) : null}

      <div className="space-y-4">
        {pricingRules.map((rule, index) => {
          const currentPair = pairKey(rule.provider_id, rule.api_model_id)
          const capabilities = Array.from(
            new Set([
              ...CAPABILITY_OPTIONS,
              ...(capabilityByPair[currentPair] ?? []),
              rule.capability_id || "text.generate",
            ])
          )

          return (
            <section key={rule.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Rule {index + 1}</div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateRule(rule.id)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void removeRule(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <FieldRow label="Provider model">
                <Select
                  value={
                    providerPairOptions.some(
                      (row) => pairKey(row.provider_id, row.api_model_id) === currentPair
                    )
                      ? currentPair
                      : undefined
                  }
                  onValueChange={(value) => setRulePair(rule.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider + model" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerPairOptions.map((row) => {
                      const value = pairKey(row.provider_id, row.api_model_id)
                      const providerName = providerNames[row.provider_id] ?? row.provider_id
                      return (
                        <SelectItem key={value} value={value}>
                          {providerName} / {row.api_model_id}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Capability">
                <Select
                  value={rule.capability_id || "text.generate"}
                  onValueChange={(value) => setRuleField(rule.id, "capability_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {capabilities.map((capability) => (
                      <SelectItem key={capability} value={capability}>
                        {capability}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Pricing plan">
                <Select
                  value={rule.pricing_plan}
                  onValueChange={(value) => setRuleField(rule.id, "pricing_plan", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_PLANS.map((plan) => (
                      <SelectItem key={plan.value} value={plan.value}>
                        {plan.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow
                label="Meter"
                description="Selecting a meter can auto-fill default unit + unit size."
              >
                <Select value={rule.meter} onValueChange={(value) => setRuleField(rule.id, "meter", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_METER_OPTIONS.map((meter) => (
                      <SelectItem key={meter.value} value={meter.value}>
                        {meter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Pricing values">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    value={rule.unit}
                    onChange={(event) => setRuleField(rule.id, "unit", event.target.value)}
                    placeholder="Unit (token, image, request)"
                  />
                  <Input
                    type="number"
                    value={rule.unit_size}
                    onChange={(event) => setRuleField(rule.id, "unit_size", event.target.value)}
                    placeholder="Unit size"
                  />
                  <Input
                    type="number"
                    step="0.000001"
                    value={rule.price_per_unit}
                    onChange={(event) => setRuleField(rule.id, "price_per_unit", event.target.value)}
                    placeholder="Price per unit"
                  />
                  <Input
                    value={rule.currency}
                    onChange={(event) => setRuleField(rule.id, "currency", event.target.value)}
                    placeholder="Currency (USD)"
                  />
                </div>
              </FieldRow>

              <FieldRow label="Priority">
                <Input
                  type="number"
                  value={rule.priority}
                  onChange={(event) => setRuleField(rule.id, "priority", event.target.value)}
                  placeholder="100"
                />
              </FieldRow>

              <FieldRow label="Effective window">
                <div className="grid gap-2 sm:grid-cols-2">
                  <DatePickerInput
                    value={rule.effective_from}
                    onChange={(value) => setRuleField(rule.id, "effective_from", value)}
                    placeholder="Effective from"
                  />
                  <DatePickerInput
                    value={rule.effective_to}
                    onChange={(value) => setRuleField(rule.id, "effective_to", value)}
                    placeholder="Effective to"
                  />
                </div>
              </FieldRow>

              <FieldRow label="Rule note">
                <Input
                  value={rule.note}
                  onChange={(event) => setRuleField(rule.id, "note", event.target.value)}
                  placeholder="Optional note"
                />
              </FieldRow>

              <section className="space-y-3 rounded-md border border-dashed p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Conditions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addCondition(rule.id)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add condition
                  </Button>
                </div>

                {rule.conditions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No conditions means this rule is an unconditional fallback for the selected
                    provider model + capability.
                  </p>
                ) : null}

                {rule.conditions.map((condition, conditionIndex) => (
                  <div key={condition.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">
                        Condition {conditionIndex + 1}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(rule.id, condition.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <FieldRow
                      label="Path"
                      description="Example: usage.context.max_tokens or image_params.quality"
                    >
                      <Input
                        value={condition.path}
                        onChange={(event) =>
                          setConditionField(rule.id, condition.id, "path", event.target.value)
                        }
                        placeholder="request field path"
                      />
                    </FieldRow>

                    <FieldRow label="Operation">
                      <Select
                        value={condition.op}
                        onValueChange={(value) =>
                          setConditionField(rule.id, condition.id, "op", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OP_OPTIONS.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldRow>

                    <FieldRow label="Value type">
                      <Select
                        value={condition.value_type}
                        onValueChange={(value) =>
                          setConditionField(rule.id, condition.id, "value_type", value as ValueType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="list">List</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldRow>

                    <FieldRow label="Value">
                      {condition.value_type === "number" ? (
                        <Input
                          type="number"
                          value={condition.value_number}
                          onChange={(event) =>
                            setConditionField(rule.id, condition.id, "value_number", event.target.value)
                          }
                          placeholder="32768"
                        />
                      ) : condition.value_type === "list" ? (
                        <Input
                          value={condition.value_list}
                          onChange={(event) =>
                            setConditionField(rule.id, condition.id, "value_list", event.target.value)
                          }
                          placeholder="comma list or JSON array"
                        />
                      ) : (
                        <Input
                          value={condition.value_text}
                          onChange={(event) =>
                            setConditionField(rule.id, condition.id, "value_text", event.target.value)
                          }
                          placeholder="text value"
                        />
                      )}
                    </FieldRow>

                    <FieldRow
                      label="Logic"
                      description="Use group to combine AND/OR clauses."
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={condition.apply}
                          onValueChange={(value) =>
                            setConditionField(rule.id, condition.id, "apply", value as ApplyMode)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="and">AND</SelectItem>
                            <SelectItem value="or">OR</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={condition.group}
                          onChange={(event) =>
                            setConditionField(rule.id, condition.id, "group", event.target.value)
                          }
                          placeholder="Group index (optional)"
                        />
                      </div>
                    </FieldRow>

                    <FieldRow label="Condition note">
                      <Input
                        value={condition.note}
                        onChange={(event) =>
                          setConditionField(rule.id, condition.id, "note", event.target.value)
                        }
                        placeholder="Optional note"
                      />
                    </FieldRow>
                  </div>
                ))}
              </section>
            </section>
          )
        })}
      </div>
    </div>
  )
}

