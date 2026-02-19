"use client"

import { useEffect, useState } from "react"
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

interface BasicTabProps {
  model: ModelData
  onModelChange: (model: ModelData) => void
}

interface ExistingModel {
  model_id: string
  name: string
}

interface OrganisationOption {
  organisation_id: string
  name: string | null
}

interface FamilyOption {
  family_id: string
  family_name: string | null
}

const TYPE_OPTIONS = ["text", "image", "audio", "video"] as const

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseTypeList(value: string | null): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is string => TYPE_OPTIONS.includes(item as any))
}

export default function BasicTab({ model, onModelChange }: BasicTabProps) {
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([])
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([])
  const [families, setFamilies] = useState<FamilyOption[]>([])

  useEffect(() => {
    const fetchOptions = async () => {
      const supabase = createClient()
      const [{ data: modelsData }, { data: organisationData }, { data: familyData }] = await Promise.all([
        supabase
          .from("data_models")
          .select("model_id, name")
          .neq("model_id", model.model_id)
          .order("name")
          .limit(300),
        supabase
          .from("data_organisations")
          .select("organisation_id, name")
          .order("name")
          .limit(300),
        supabase
          .from("data_model_families")
          .select("family_id, family_name")
          .order("family_name")
          .limit(500),
      ])

      setExistingModels((modelsData ?? []).map((item: any) => ({
        model_id: item.model_id,
        name: item.name || item.model_id,
      })))
      setOrganisations((organisationData ?? []) as OrganisationOption[])
      setFamilies((familyData ?? []) as FamilyOption[])
    }
    void fetchOptions()
  }, [model.model_id])

  useEffect(() => {
    if (!model.organisation_id && organisations.length > 0) {
      onModelChange({ ...model, organisation_id: organisations[0].organisation_id })
    }
  }, [model, organisations, onModelChange])

  const inputTypes = parseTypeList(model.input_types)
  const outputTypes = parseTypeList(model.output_types)

  const toggleType = (field: "input_types" | "output_types", value: string) => {
    const current = new Set(field === "input_types" ? inputTypes : outputTypes)
    if (current.has(value)) current.delete(value)
    else current.add(value)
    const next = Array.from(current)
    onModelChange({
      ...model,
      [field]: next.length ? next.join(",") : null,
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Label>Model Name</Label>
          <Input
            value={model.name || ""}
            onChange={(event) => onModelChange({ ...model, name: event.target.value })}
          />
        </div>
        <div>
          <Label>Organisation ID</Label>
          <Select
            value={model.organisation_id ?? undefined}
            onValueChange={(value) => onModelChange({ ...model, organisation_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select organisation" />
            </SelectTrigger>
            <SelectContent>
              {organisations.map((organisation) => (
                <SelectItem key={organisation.organisation_id} value={organisation.organisation_id}>
                  {organisation.name ?? organisation.organisation_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <Label>Status</Label>
          <Select
            value={model.status || "active"}
            onValueChange={(value) => onModelChange({ ...model, status: value })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Rumoured">Rumoured</SelectItem>
              <SelectItem value="Announced">Announced</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="Deprecated">Deprecated</SelectItem>
              <SelectItem value="Retired">Retired</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="beta">beta</SelectItem>
              <SelectItem value="preview">preview</SelectItem>
              <SelectItem value="deprecated">deprecated</SelectItem>
              <SelectItem value="retired">retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Previous Model</Label>
          <Select
            value={model.previous_model_id || "__none__"}
            onValueChange={(value) =>
              onModelChange({
                ...model,
                previous_model_id: value === "__none__" ? null : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select previous model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {existingModels.map((existingModel) => (
                <SelectItem key={existingModel.model_id} value={existingModel.model_id}>
                  {existingModel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Model Family</Label>
          <Select
            value={model.family_id || "__none__"}
            onValueChange={(value) =>
              onModelChange({
                ...model,
                family_id: value === "__none__" ? null : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select family" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {families.map((family) => (
                <SelectItem key={family.family_id} value={family.family_id}>
                  {family.family_name ?? family.family_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Label>License</Label>
          <Input
            value={model.license || ""}
            onChange={(event) => onModelChange({ ...model, license: event.target.value || null })}
            placeholder="e.g., Apache-2.0"
          />
        </div>
        <div className="rounded-md border p-3">
          <Label className="text-sm">Visibility</Label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <Checkbox
              checked={Boolean(model.hidden)}
              onCheckedChange={(checked) => onModelChange({ ...model, hidden: checked === true })}
            />
            <div>
              <div>Hidden</div>
              <div className="text-xs text-muted-foreground">Hide this model from public listings.</div>
            </div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Label>Announcement Date</Label>
          <DatePickerInput
            value={formatDateForInput(model.announcement_date)}
            onChange={(value) => onModelChange({ ...model, announcement_date: value || null })}
            placeholder="Announcement date"
          />
        </div>
        <div>
          <Label>Release Date</Label>
          <DatePickerInput
            value={formatDateForInput(model.release_date)}
            onChange={(value) => onModelChange({ ...model, release_date: value || null })}
            placeholder="Release date"
          />
        </div>
        <div>
          <Label>Deprecation Date</Label>
          <DatePickerInput
            value={formatDateForInput(model.deprecation_date)}
            onChange={(value) => onModelChange({ ...model, deprecation_date: value || null })}
            placeholder="Deprecation date"
          />
        </div>
        <div>
          <Label>Retirement Date</Label>
          <DatePickerInput
            value={formatDateForInput(model.retirement_date)}
            onChange={(value) => onModelChange({ ...model, retirement_date: value || null })}
            placeholder="Retirement date"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Label>Input Types</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((type) => {
              const active = inputTypes.includes(type)
              return (
                <Button
                  key={`input-${type}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleType("input_types", type)}
                  className={cn(active && "border-primary bg-primary/10")}
                >
                  {type}
                </Button>
              )
            })}
          </div>
        </div>
        <div>
          <Label>Output Types</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((type) => {
              const active = outputTypes.includes(type)
              return (
                <Button
                  key={`output-${type}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleType("output_types", type)}
                  className={cn(active && "border-primary bg-primary/10")}
                >
                  {type}
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
