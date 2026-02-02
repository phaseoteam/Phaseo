"use client"

import { useState, useEffect } from "react"
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

interface BasicTabProps {
  model: ModelData
  onModelChange: (model: ModelData) => void
}

interface ExistingModel {
  model_id: string
  name: string
}

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().split("T")[0]
}

export default function BasicTab({ model, onModelChange }: BasicTabProps) {
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([])

  useEffect(() => {
    const fetchModels = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("data_models")
        .select("model_id, name")
        .neq("model_id", model.model_id)
        .order("name")
        .limit(100)

      if (data) {
        setExistingModels(data.map((m: any) => ({
          model_id: m.model_id,
          name: m.name || m.model_id,
        })))
      }
    }
    fetchModels()
  }, [model.model_id])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Model Name</Label>
          <Input
            value={model.name || ""}
            onChange={(e) => onModelChange({ ...model, name: e.target.value })}
          />
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={model.status || ""}
            onValueChange={(value) => onModelChange({ ...model, status: value })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Rumoured">Rumoured</SelectItem>
              <SelectItem value="Announced">Announced</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="Deprecated">Deprecated</SelectItem>
              <SelectItem value="Retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Announcement Date</Label>
          <Input
            type="date"
            value={formatDateForInput(model.announcement_date)}
            onChange={(e) => onModelChange({ ...model, announcement_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Release Date</Label>
          <Input
            type="date"
            value={formatDateForInput(model.release_date)}
            onChange={(e) => onModelChange({ ...model, release_date: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Deprecation Date</Label>
          <Input
            type="date"
            value={formatDateForInput(model.deprecation_date)}
            onChange={(e) => onModelChange({ ...model, deprecation_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Retirement Date</Label>
          <Input
            type="date"
            value={formatDateForInput(model.retirement_date)}
            onChange={(e) => onModelChange({ ...model, retirement_date: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Previous Model</Label>
          <Select
            value={model.previous_model_id || ""}
            onValueChange={(value) => onModelChange({ ...model, previous_model_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select previous model" />
            </SelectTrigger>
            <SelectContent>
              {existingModels.map((m) => (
                <SelectItem key={m.model_id} value={m.model_id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Family ID</Label>
          <Input
            value={model.family_id || ""}
            onChange={(e) => onModelChange({ ...model, family_id: e.target.value })}
            placeholder="e.g., gpt-4"
          />
        </div>
      </div>
    </div>
  )
}
