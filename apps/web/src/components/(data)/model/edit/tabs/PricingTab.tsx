"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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

interface PricingCondition {
  path: string
  op: string
  value: unknown
  and_index?: number
  or_group?: number
}

interface PricingRule {
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
  tiering_mode: string | null
  note: string | null
  priority: number
  effective_from: string | null
  effective_to: string | null
  match: PricingCondition[]
}

interface PricingTabProps {
  modelId: string
  onPricingRulesChange?: (pricingRules: PricingRule[]) => void
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
]

const COMMON_CAPABILITIES = [
  "chat/completions",
  "responses",
  "embeddings",
  "images/generations",
  "audio/transcriptions",
  "audio/speech",
]

function parseModelKey(modelKey: string): { provider: string; apiModel: string; capability: string } {
  const [provider = "", apiModel = "", ...rest] = modelKey.split(":")
  return {
    provider,
    apiModel,
    capability: rest.join(":") || "chat/completions",
  }
}

function buildModelKey(providerId: string, apiModelId: string, capabilityId: string): string {
  return `${providerId}:${apiModelId}:${capabilityId || "chat/completions"}`
}

function normalizePricingMatch(value: unknown): PricingCondition[] {
  if (!Array.isArray(value)) return []
  return value.map((condition: any) => ({
    path: typeof condition?.path === "string" ? condition.path : "",
    op: typeof condition?.op === "string" ? condition.op : "eq",
    value: condition?.value ?? "",
    and_index:
      typeof condition?.and_index === "number" ? condition.and_index : undefined,
    or_group:
      typeof condition?.or_group === "number" ? condition.or_group : undefined,
  }))
}

function formatConditionValue(value: unknown): string {
  if (typeof value === "string") return value
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

function parseConditionValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

export default function PricingTab({ modelId, onPricingRulesChange }: PricingTabProps) {
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [providerIds, setProviderIds] = useState<string[]>([])
  const [providerModels, setProviderModels] = useState<ProviderModelRef[]>([])
  const [capabilityOptionsByPair, setCapabilityOptionsByPair] = useState<Record<string, string[]>>({})

  const pairKey = (providerId: string, apiModelId: string) => `${providerId}::${apiModelId}`
  const fromPairKey = (key: string) => {
    const idx = key.indexOf("::")
    if (idx < 0) return { provider_id: "", api_model_id: "" }
    return {
      provider_id: key.slice(0, idx),
      api_model_id: key.slice(idx + 2),
    }
  }
  const providerPairOptions = Array.from(
    new Map(
      providerModels.map((pm) => [pairKey(pm.provider_id, pm.api_model_id), pm])
    ).values()
  )

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: providerModels } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, api_model_id")
        .eq("internal_model_id", modelId)

      setProviderModels(providerModels ?? [])
      const providerPairs = new Set(
        (providerModels ?? []).map((row: any) => `${row.provider_id}:${row.api_model_id}`)
      )
      const providerSet = new Set<string>((providerModels ?? []).map((row: any) => row.provider_id))
      setProviderIds(Array.from(providerSet))

      const providerApiModelIds = (providerModels ?? []).map((row: any) => row.provider_api_model_id)
      const providerById = new Map<string, { provider_id: string; api_model_id: string }>(
        (providerModels ?? []).map((row: any) => [
          row.provider_api_model_id,
          {
            provider_id: row.provider_id,
            api_model_id: row.api_model_id,
          },
        ])
      )
      if (providerApiModelIds.length > 0) {
        const { data: capabilityRows } = await supabase
          .from("data_api_provider_model_capabilities")
          .select("provider_api_model_id, capability_id")
          .in("provider_api_model_id", providerApiModelIds)

        const capabilityMap = new Map<string, Set<string>>()
        for (const row of capabilityRows ?? []) {
          const providerData = providerById.get(row.provider_api_model_id)
          if (!providerData || !row.capability_id) continue
          const key = pairKey(providerData.provider_id, providerData.api_model_id)
          const set = capabilityMap.get(key) ?? new Set<string>()
          set.add(row.capability_id)
          capabilityMap.set(key, set)
        }
        setCapabilityOptionsByPair(
          Object.fromEntries(
            Array.from(capabilityMap.entries()).map(([key, value]) => [
              key,
              Array.from(value).sort(),
            ])
          )
        )
      } else {
        setCapabilityOptionsByPair({})
      }

      const { data } = await supabase
        .from("data_api_pricing_rules")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(5000)

      const filtered = (data ?? []).filter((row: any) => {
        const parsed = parseModelKey(row.model_key ?? "")
        return (
          providerPairs.has(`${parsed.provider}:${parsed.apiModel}`) ||
          parsed.apiModel === modelId
        )
      })

      setPricingRules(
        filtered.map((p: any) => {
          const parsed = parseModelKey(p.model_key ?? "")
          return {
            id: p.rule_id,
            model_key: p.model_key,
            provider_id: parsed.provider,
            api_model_id: parsed.apiModel,
            capability_id: p.capability_id ?? parsed.capability,
            pricing_plan: p.pricing_plan ?? "standard",
            meter: p.meter,
            unit: p.unit ?? "token",
            unit_size: Number(p.unit_size ?? 1),
            price_per_unit: Number(p.price_per_unit ?? 0),
            currency: p.currency ?? "USD",
            tiering_mode: p.tiering_mode,
            note: p.note,
            priority: Number(p.priority ?? 100),
            effective_from: p.effective_from,
            effective_to: p.effective_to,
            match: normalizePricingMatch(p.match),
          }
        })
      )
    }
    fetchData()
  }, [modelId])

  useEffect(() => {
    onPricingRulesChange?.(pricingRules)
  }, [pricingRules, onPricingRulesChange])

  const updatePricingRule = (id: string, field: string, value: any) => {
    setPricingRules(
      pricingRules.map((p) => {
        if (p.id !== id) return p
        const next = { ...p, [field]: value }
        next.model_key = buildModelKey(next.provider_id, next.api_model_id, next.capability_id)
        return next
      })
    )
  }

  const updateProviderPair = (id: string, selectedPair: string) => {
    const { provider_id, api_model_id } = fromPairKey(selectedPair)
    if (!provider_id || !api_model_id) return
    setPricingRules(
      pricingRules.map((p) => {
        if (p.id !== id) return p
        const next = { ...p, provider_id, api_model_id }
        next.model_key = buildModelKey(next.provider_id, next.api_model_id, next.capability_id)
        return next
      })
    )
  }

  const removePricingRule = async (id: string) => {
    if (!id.startsWith("new-")) {
      try {
        await deletePricingRule(id)
      } catch (err) {
        console.error("Error deleting pricing rule:", err)
        return
      }
    }
    setPricingRules(pricingRules.filter((p) => p.id !== id))
  }

  const updateCondition = (
    pricingRuleId: string,
    conditionIndex: number,
    field: keyof PricingCondition,
    value: unknown
  ) => {
    setPricingRules(
      pricingRules.map((rule) => {
        if (rule.id !== pricingRuleId) return rule
        const nextMatch = [...normalizePricingMatch(rule.match)]
        const current = nextMatch[conditionIndex]
        if (!current) return rule
        nextMatch[conditionIndex] = {
          ...current,
          [field]: value,
        }
        return {
          ...rule,
          match: nextMatch,
        }
      })
    )
  }

  const addCondition = (pricingRuleId: string) => {
    setPricingRules(
      pricingRules.map((rule) =>
        rule.id === pricingRuleId
          ? {
              ...rule,
              match: [
                ...normalizePricingMatch(rule.match),
                { path: "usage.context.max_tokens", op: "lte", value: "" },
              ],
            }
          : rule
      )
    )
  }

  const removeCondition = (pricingRuleId: string, conditionIndex: number) => {
    setPricingRules(
      pricingRules.map((rule) =>
        rule.id === pricingRuleId
          ? {
              ...rule,
              match: normalizePricingMatch(rule.match).filter((_, index) => index !== conditionIndex),
            }
          : rule
      )
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Pricing Rules</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const firstProviderModel = providerPairOptions[0]
            const providerId = firstProviderModel?.provider_id ?? providerIds[0] ?? ""
            const apiModelId = firstProviderModel?.api_model_id ?? modelId
            const pairCapabilities =
              capabilityOptionsByPair[pairKey(providerId, apiModelId)] ?? COMMON_CAPABILITIES
            setPricingRules([
              ...pricingRules,
              {
                id: `new-${Date.now()}`,
                model_key: buildModelKey(providerId, apiModelId, pairCapabilities[0] ?? "chat/completions"),
                provider_id: providerId,
                api_model_id: apiModelId,
                capability_id: pairCapabilities[0] ?? "chat/completions",
                pricing_plan: "standard",
                meter: PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens",
                unit: "token",
                unit_size: 1,
                price_per_unit: 0,
                currency: "USD",
                tiering_mode: null,
                note: null,
                priority: 100,
                effective_from: null,
                effective_to: null,
                match: [],
              },
            ])
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3 max-h-[40rem] overflow-y-auto">
        {pricingRules.map((rule) => {
          const pair = pairKey(rule.provider_id, rule.api_model_id)
          const match = normalizePricingMatch(rule.match)
          const capabilityOptions = Array.from(
            new Set([
              ...COMMON_CAPABILITIES,
              ...(capabilityOptionsByPair[pair] ?? []),
              rule.capability_id || "chat/completions",
            ])
          )
          const selectedPairExists = providerPairOptions.some(
            (pm) => pairKey(pm.provider_id, pm.api_model_id) === pair
          )

          return (
            <div key={rule.id} className="border rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider Model (Quick Pick)</Label>
                <Select
                  value={selectedPairExists ? pair : undefined}
                  onValueChange={(value) => updateProviderPair(rule.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider + API model" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerPairOptions.map((pm) => {
                      const value = pairKey(pm.provider_id, pm.api_model_id)
                      return (
                        <SelectItem key={value} value={value}>
                          {pm.provider_id} / {pm.api_model_id}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Capability (Quick Pick)</Label>
                <Select value={rule.capability_id || "chat/completions"} onValueChange={(value) => updatePricingRule(rule.id, "capability_id", value)}>
                  <SelectTrigger><SelectValue placeholder="Select capability" /></SelectTrigger>
                  <SelectContent>
                    {capabilityOptions.map((capability) => (
                      <SelectItem key={capability} value={capability}>{capability}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pricing Plan</Label>
                <Select value={rule.pricing_plan} onValueChange={(value) => updatePricingRule(rule.id, "pricing_plan", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_PLANS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider ID</Label>
                <Input
                  value={rule.provider_id}
                  onChange={(e) => updatePricingRule(rule.id, "provider_id", e.target.value)}
                  placeholder="openai"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Model ID</Label>
                <Input
                  value={rule.api_model_id}
                  onChange={(e) => updatePricingRule(rule.id, "api_model_id", e.target.value)}
                  placeholder="gpt-4o"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Capability ID</Label>
                <Input
                  value={rule.capability_id}
                  onChange={(e) => updatePricingRule(rule.id, "capability_id", e.target.value)}
                  placeholder="chat/completions"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs">Meter</Label>
                <Select value={rule.meter} onValueChange={(value) => updatePricingRule(rule.id, "meter", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_METER_OPTIONS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input
                  value={rule.unit}
                  onChange={(e) => updatePricingRule(rule.id, "unit", e.target.value)}
                  placeholder="token"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit Size</Label>
                <Input
                  type="number"
                  value={rule.unit_size}
                  onChange={(e) => updatePricingRule(rule.id, "unit_size", Number(e.target.value))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price Per Unit</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={rule.price_per_unit}
                  onChange={(e) => updatePricingRule(rule.id, "price_per_unit", Number(e.target.value))}
                  placeholder="0.000001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={rule.currency}
                  onChange={(e) => updatePricingRule(rule.id, "currency", e.target.value)}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Tiering Mode</Label>
                <Input
                  value={rule.tiering_mode || ""}
                  onChange={(e) => updatePricingRule(rule.id, "tiering_mode", e.target.value || null)}
                  placeholder="flat"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Input
                  type="number"
                  value={rule.priority}
                  onChange={(e) => updatePricingRule(rule.id, "priority", Number(e.target.value))}
                  placeholder="100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective From</Label>
                <Input
                  type="date"
                  value={rule.effective_from ? rule.effective_from.split("T")[0] : ""}
                  onChange={(e) => updatePricingRule(rule.id, "effective_from", e.target.value || null)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective To</Label>
                <Input
                  type="date"
                  value={rule.effective_to ? rule.effective_to.split("T")[0] : ""}
                  onChange={(e) => updatePricingRule(rule.id, "effective_to", e.target.value || null)}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Conditions (match)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addCondition(rule.id)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Condition
                </Button>
              </div>
              {match.length === 0 ? (
                <p className="text-xs text-muted-foreground">No conditions. Rule applies to all matching requests.</p>
              ) : null}
              {match.map((condition, conditionIndex) => (
                <div key={`${rule.id}-condition-${conditionIndex}`} className="grid grid-cols-1 gap-2 rounded-md border p-2 lg:grid-cols-6">
                  <div className="space-y-1 lg:col-span-2">
                    <Label className="text-xs">Path</Label>
                    <Input
                      value={condition.path}
                      onChange={(e) =>
                        updateCondition(rule.id, conditionIndex, "path", e.target.value)
                      }
                      placeholder="usage.context.max_tokens"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Operator</Label>
                    <Select
                      value={condition.op || "eq"}
                      onValueChange={(value) =>
                        updateCondition(rule.id, conditionIndex, "op", value)
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"].map((operator) => (
                          <SelectItem key={operator} value={operator}>{operator}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 lg:col-span-2">
                    <Label className="text-xs">Value (JSON or plain)</Label>
                    <Input
                      value={formatConditionValue(condition.value)}
                      onChange={(e) =>
                        updateCondition(
                          rule.id,
                          conditionIndex,
                          "value",
                          parseConditionValue(e.target.value)
                        )
                      }
                      placeholder={'32768 or true or ["1024x1024"]'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Actions</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(rule.id, conditionIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">AND Index (optional)</Label>
                    <Input
                      type="number"
                      value={condition.and_index ?? ""}
                      onChange={(e) =>
                        updateCondition(
                          rule.id,
                          conditionIndex,
                          "and_index",
                          e.target.value === "" ? undefined : Number(e.target.value)
                        )
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">OR Group (optional)</Label>
                    <Input
                      type="number"
                      value={condition.or_group ?? ""}
                      onChange={(e) =>
                        updateCondition(
                          rule.id,
                          conditionIndex,
                          "or_group",
                          e.target.value === "" ? undefined : Number(e.target.value)
                        )
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  value={rule.note || ""}
                  onChange={(e) => updatePricingRule(rule.id, "note", e.target.value || null)}
                  placeholder="Optional note"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePricingRule(rule.id)} className="mt-6">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground font-mono break-all">{rule.model_key}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
