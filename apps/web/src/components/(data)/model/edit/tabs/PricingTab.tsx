"use client"

import { useState, useEffect } from "react"
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
import { createClient } from "@/utils/supabase/client"

interface PricingRule {
  id: string
  model_key: string
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
}

interface PricingTabProps {
  modelId: string
}

const PRICING_PLANS = [
  { value: "standard", label: "Standard" },
  { value: "batch", label: "Batch" },
  { value: "flex", label: "Flex" },
  { value: "priority", label: "Priority" },
]

const PRICING_METERS = [
  { value: "input_text_tokens", label: "Input Text Tokens" },
  { value: "output_text_tokens", label: "Output Text Tokens" },
  { value: "input_image", label: "Input Images" },
  { value: "output_image", label: "Output Images" },
  { value: "audio_input", label: "Audio Input" },
  { value: "audio_output", label: "Audio Output" },
  { value: "video_input", label: "Video Input" },
  { value: "requests", label: "Requests" },
]

function parseModelKey(modelKey: string): { provider: string; apiModel: string; capability: string } {
  const parts = modelKey.split(":")
  return {
    provider: parts[0] || "",
    apiModel: parts[1] || "",
    capability: parts[2] || "",
  }
}

export default function PricingTab({ modelId }: PricingTabProps) {
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("data_api_pricing_rules")
        .select("*")
        .ilike("model_key", `${modelId}%`)

      if (data) {
        setPricingRules(
          data.map((p: any) => ({
            id: p.rule_id,
            model_key: p.model_key,
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
          }))
        )
      }
    }
    fetchData()
  }, [modelId])

  const updatePricingRule = (id: string, field: string, value: any) => {
    setPricingRules(pricingRules.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Pricing Rules</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setPricingRules([
              ...pricingRules,
              {
                id: `new-${Date.now()}`,
                model_key: "",
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1,
                price_per_unit: 0,
                currency: "USD",
                tiering_mode: null,
                note: null,
                priority: 100,
                effective_from: null,
                effective_to: null,
              },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {pricingRules.map((rule) => {
          const parsed = parseModelKey(rule.model_key)
          return (
            <div key={rule.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <Select value={rule.pricing_plan} onValueChange={(value) => updatePricingRule(rule.id, "pricing_plan", value)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_PLANS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={rule.meter} onValueChange={(value) => updatePricingRule(rule.id, "meter", value)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_METERS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.000001"
                  value={rule.price_per_unit}
                  onChange={(e) => updatePricingRule(rule.id, "price_per_unit", Number(e.target.value))}
                  placeholder="Price"
                  className="w-24"
                />
                <Button variant="ghost" size="icon" onClick={() => removePricingRule(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Provider: {parsed.provider || "-"}</span>
                <span>Model: {parsed.apiModel || "-"}</span>
                <span>Capability: {parsed.capability || "-"}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
