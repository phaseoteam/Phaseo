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
import { createClient } from "@/utils/supabase/client"
import type { ModelData } from "../ModelEditDialog"

interface DetailsTabProps {
  modelId: string
  model: ModelData
  onModelChange: (model: ModelData) => void
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

const LINK_PLATFORMS = [
  { value: "api_reference", label: "API Reference" },
  { value: "paper", label: "Paper" },
  { value: "announcement", label: "Announcement" },
  { value: "repository", label: "Repository" },
  { value: "weights", label: "Weights" },
  { value: "playground", label: "Playground" },
  { value: "docs", label: "Documentation" },
  { value: "blog", label: "Blog" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
]

export default function DetailsTab({ modelId, model, onModelChange }: DetailsTabProps) {
  const [details, setDetails] = useState<ModelDetail[]>([
    { id: "1", detail_name: "parameter_count", detail_value: "" },
    { id: "2", detail_name: "input_context_length", detail_value: "" },
    { id: "3", detail_name: "output_context_length", detail_value: "" },
    { id: "4", detail_name: "knowledge_cutoff", detail_value: "" },
    { id: "5", detail_name: "training_tokens", detail_value: "" },
    { id: "6", detail_name: "license", detail_value: "" },
  ])
  const [links, setLinks] = useState<ModelLink[]>([
    { id: "1", platform: "api_reference", url: "" },
    { id: "2", platform: "paper", url: "" },
    { id: "3", platform: "announcement", url: "" },
    { id: "4", platform: "repository", url: "" },
    { id: "5", platform: "weights", url: "" },
  ])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: detailsData } = await supabase
        .from("data_model_details")
        .select("id, detail_name, detail_value")
        .eq("model_id", modelId)

      const { data: linksData } = await supabase
        .from("data_model_links")
        .select("id, platform, url")
        .eq("model_id", modelId)

      if (detailsData?.length) {
        setDetails(detailsData.map((d: any) => ({
          id: d.id,
          detail_name: d.detail_name,
          detail_value: d.detail_value?.toString() ?? "",
        })))
      }

      if (linksData?.length) {
        setLinks(linksData.map((l: any) => ({
          id: l.id,
          platform: l.platform,
          url: l.url,
        })))
      }
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

  const toggleModality = (type: "input" | "output", modality: string) => {
    const currentTypes = type === "input" ? model.input_types : model.output_types
    const current = parseTypes(currentTypes)
    const updated = current.includes(modality)
      ? current.filter((m) => m !== modality)
      : [...current, modality]
    const newTypes = updated.length > 0 ? JSON.stringify(updated) : null

    if (type === "input") {
      onModelChange({ ...model, input_types: newTypes })
    } else {
      onModelChange({ ...model, output_types: newTypes })
    }
  }

  const updateDetail = (id: string, field: "detail_name" | "detail_value", value: string) => {
    setDetails(details.map((d) => (d.id === id ? { ...d, [field]: value } : d)))
  }

  const updateLink = (id: string, field: "platform" | "url", value: string) => {
    setLinks(links.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-2 block">Input Modalities</Label>
        <div className="flex gap-2">
          {["text", "image", "audio", "video"].map((modality) => {
            const enabled = parseTypes(model.input_types).includes(modality)
            return (
              <Button
                key={modality}
                variant={enabled ? "default" : "outline"}
                size="sm"
                onClick={() => toggleModality("input", modality)}
              >
                {modality.charAt(0).toUpperCase() + modality.slice(1)}
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Output Modalities</Label>
        <div className="flex gap-2">
          {["text", "image", "audio", "video"].map((modality) => {
            const enabled = parseTypes(model.output_types).includes(modality)
            return (
              <Button
                key={modality}
                variant={enabled ? "default" : "outline"}
                size="sm"
                onClick={() => toggleModality("output", modality)}
              >
                {modality.charAt(0).toUpperCase() + modality.slice(1)}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">Model Details</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDetails([...details, { id: `new-${Date.now()}`, detail_name: "", detail_value: "" }])
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {details.map((detail) => (
            <div key={detail.id} className="flex gap-2">
              <Input
                value={detail.detail_name}
                onChange={(e) => updateDetail(detail.id, "detail_name", e.target.value)}
                placeholder="Name"
                className="flex-1"
              />
              <Input
                value={detail.detail_value}
                onChange={(e) => updateDetail(detail.id, "detail_value", e.target.value)}
                placeholder="Value"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDetails(details.filter((d) => d.id !== detail.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">Links</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLinks([...links, { id: `new-${Date.now()}`, platform: "other", url: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {links.map((link) => (
            <div key={link.id} className="flex gap-2">
              <Select value={link.platform} onValueChange={(value) => updateLink(link.id, "platform", value)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINK_PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={link.url}
                onChange={(e) => updateLink(link.id, "url", e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => setLinks(links.filter((l) => l.id !== link.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
