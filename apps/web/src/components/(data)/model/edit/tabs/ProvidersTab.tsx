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
import { Checkbox } from "@/components/ui/checkbox"
import { deleteProviderModel } from "@/app/(dashboard)/models/actions"
import { createClient } from "@/utils/supabase/client"
import type { ModelData } from "../ModelEditDialog"

interface ProviderModel {
  id: string
  provider_id: string
  api_model_id: string
  provider_model_slug: string | null
  is_active_gateway: boolean
  input_modalities: string | null
  output_modalities: string | null
  effective_from: string | null
  effective_to: string | null
  provider_name?: string
}

interface FamilyInfo {
  family_id: string
  family_name: string
  family_description: string | null
}

interface ProvidersTabProps {
  modelId: string
  model: ModelData
  onModelChange: (model: ModelData) => void
  providers: Array<{ id: string; name: string }>
}

export default function ProvidersTab({ modelId, model, onModelChange, providers }: ProvidersTabProps) {
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([])
  const [families, setFamilies] = useState<Array<{ id: string; name: string }>>([])
  const [selectedFamily, setSelectedFamily] = useState<string>("")

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: familyData } = await supabase
        .from("data_model_families")
        .select("family_id, family_name")
        .order("family_name")

      if (familyData) {
        setFamilies(familyData.map((f: any) => ({
          id: f.family_id,
          name: f.family_name || f.family_id,
        })))
      }

      const { data: pmData } = await supabase
        .from("data_api_provider_models")
        .select("*")
        .eq("internal_model_id", modelId)

      const pmWithProviders = await Promise.all(
        (pmData || []).map(async (pm: any) => {
          const { data: prov } = await supabase
            .from("data_api_providers")
            .select("api_provider_name")
            .eq("api_provider_id", pm.provider_id)
            .single()
          return {
            id: pm.provider_api_model_id,
            provider_id: pm.provider_id,
            api_model_id: pm.api_model_id,
            provider_model_slug: pm.provider_model_slug,
            is_active_gateway: pm.is_active_gateway,
            input_modalities: pm.input_modalities,
            output_modalities: pm.output_modalities,
            effective_from: pm.effective_from,
            effective_to: pm.effective_to,
            provider_name: prov?.api_provider_name ?? pm.provider_id,
          }
        })
      )
      setProviderModels(pmWithProviders)
    }
    fetchData()
  }, [modelId])

  const parseTypes = (types: string | null): string[] => {
    if (!types) return []
    if (types.startsWith("[")) {
      try {
        const parsed = JSON.parse(types)
        return Array.isArray(parsed) ? parsed.map(String) : []
      } catch {
        return []
      }
    }
    return types.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
  }

  const updateProviderModel = (id: string, field: string, value: any) => {
    setProviderModels(providerModels.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const removeProviderModel = async (id: string) => {
    if (!id.startsWith("new-")) {
      try {
        await deleteProviderModel(id)
      } catch (err) {
        console.error("Error deleting provider model:", err)
        return
      }
    }
    setProviderModels(providerModels.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium">Family</Label>
          <Select
            value={selectedFamily || model.family_id || ""}
            onValueChange={(value) => {
              setSelectedFamily(value)
              onModelChange({ ...model, family_id: value })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select family" />
            </SelectTrigger>
            <SelectContent>
              {families.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-medium">Or create new family</Label>
          <Input
            placeholder="New family name"
            onChange={(e) => {
              if (e.target.value) {
                setSelectedFamily("")
                onModelChange({ ...model, family_id: null })
              }
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Label className="text-sm font-medium">Provider Models</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setProviderModels([
              ...providerModels,
              {
                id: `new-${Date.now()}`,
                provider_id: providers[0]?.id || "",
                api_model_id: model.model_id,
                provider_model_slug: null,
                is_active_gateway: false,
                input_modalities: null,
                output_modalities: null,
                effective_from: null,
                effective_to: null,
                provider_name: providers[0]?.name || "",
              },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {providerModels.map((pm) => (
          <div key={pm.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <Select value={pm.provider_id} onValueChange={(value) => updateProviderModel(pm.id, "provider_id", value)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Input
                value={pm.api_model_id}
                onChange={(e) => updateProviderModel(pm.id, "api_model_id", e.target.value)}
                placeholder="API Model ID"
                className="flex-1"
              />
              <Input
                value={pm.provider_model_slug || ""}
                onChange={(e) => updateProviderModel(pm.id, "provider_model_slug", e.target.value)}
                placeholder="Slug (optional)"
                className="w-32"
              />
              <Button variant="ghost" size="icon" onClick={() => removeProviderModel(pm.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pm.is_active_gateway}
                  onCheckedChange={(checked) => updateProviderModel(pm.id, "is_active_gateway", checked === true)}
                />
                <Label className="text-xs">Gateway</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pm.input_modalities?.includes("text")}
                  onCheckedChange={(checked) => {
                    const modalities = parseTypes(pm.input_modalities)
                    const newModalities = checked ? [...new Set([...modalities, "text"])] : modalities.filter((m) => m !== "text")
                    updateProviderModel(pm.id, "input_modalities", newModalities.join(","))
                  }}
                />
                <Label className="text-xs">Text Input</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pm.output_modalities?.includes("text")}
                  onCheckedChange={(checked) => {
                    const modalities = parseTypes(pm.output_modalities)
                    const newModalities = checked ? [...new Set([...modalities, "text"])] : modalities.filter((m) => m !== "text")
                    updateProviderModel(pm.id, "output_modalities", newModalities.join(","))
                  }}
                />
                <Label className="text-xs">Text Output</Label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
