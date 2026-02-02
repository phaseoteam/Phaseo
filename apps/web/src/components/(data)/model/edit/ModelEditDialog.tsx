"use client"

import { useState, useEffect, useCallback } from "react"
import { Pencil, Loader2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { updateModel } from "@/app/(dashboard)/models/actions"
import { createClient } from "@/utils/supabase/client"
import BasicTab from "./tabs/BasicTab"
import DetailsTab from "./tabs/DetailsTab"
import BenchmarksTab from "./tabs/BenchmarksTab"
import PricingTab from "./tabs/PricingTab"
import ProvidersTab from "./tabs/ProvidersTab"

interface ModelEditDialogProps {
  modelId: string
  tab?: string
}

export interface ModelData {
  model_id: string
  name: string | null
  status: string | null
  announcement_date: string | null
  release_date: string | null
  deprecation_date: string | null
  retirement_date: string | null
  input_types: string | null
  output_types: string | null
  previous_model_id: string | null
  family_id: string | null
}

const TAB_LABELS = {
  basic: "Basic",
  details: "Details",
  benchmarks: "Benchmarks",
  pricing: "Pricing",
  providers: "Providers",
} as const

const TAB_HELPERS = {
  basic: "Edit basic model information",
  details: "Edit modalities, details, and links",
  benchmarks: "Manage benchmark results",
  pricing: "Configure pricing rules",
  providers: "Edit family and providers",
} as const

export default function ModelEditDialog({ modelId, tab }: ModelEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState<ModelData | null>(null)
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("basic")

  const fetchBasicData = useCallback(async () => {
    const supabase = createClient()
    const { data: modelData } = await supabase
      .from("data_models")
      .select(
        "model_id, name, status, announcement_date, release_date, deprecation_date, retirement_date, input_types, output_types, previous_model_id, family_id"
      )
      .eq("model_id", modelId)
      .single()

    const { data: providerData } = await supabase
      .from("data_api_providers")
      .select("api_provider_id, api_provider_name")

    setModel(modelData)
    if (providerData) {
      setProviders(providerData.map((p: any) => ({
        id: p.api_provider_id,
        name: p.api_provider_name ?? p.api_provider_id,
      })))
    }
  }, [modelId])

  useEffect(() => {
    if (open && !model) {
      setLoading(true)
      fetchBasicData().then(() => setLoading(false))
    }
  }, [open, model, fetchBasicData])

  useEffect(() => {
    if (tab) {
      setActiveTab(tab)
    }
  }, [tab])

  const handleSave = async () => {
    if (!model) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("data_models")
        .update({
          name: model.name,
          status: model.status,
          announcement_date: model.announcement_date,
          release_date: model.release_date,
          deprecation_date: model.deprecation_date,
          retirement_date: model.retirement_date,
          input_types: model.input_types,
          output_types: model.output_types,
          previous_model_id: model.previous_model_id,
          family_id: model.family_id,
          updated_at: new Date().toISOString(),
        })
        .eq("model_id", modelId)

      if (error) {
        throw new Error(error.message)
      }

      setOpen(false)
    } catch (err) {
      console.error("[ModelEditDialog] Error saving:", err)
      setError(err instanceof Error ? err.message : "Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const validTabs = Object.keys(TAB_LABELS)
  const currentTab = validTabs.includes(activeTab) ? activeTab : "basic"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Model</DialogTitle>
          <DialogDescription>
            Make changes and click save when done.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : model ? (
          <>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-48 justify-between">
                    {TAB_LABELS[currentTab as keyof typeof TAB_LABELS]}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {Object.entries(TAB_LABELS).map(([value, label]) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setActiveTab(value)}
                      className={currentTab === value ? "font-medium" : ""}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {TAB_HELPERS[currentTab as keyof typeof TAB_HELPERS]}
              </span>
            </div>

            <div className="mt-4">
              {currentTab === "basic" && (
                <BasicTab model={model} onModelChange={(m) => setModel(m)} />
              )}
              {currentTab === "details" && (
                <DetailsTab modelId={modelId} model={model} onModelChange={(m) => setModel(m)} />
              )}
              {currentTab === "benchmarks" && <BenchmarksTab modelId={modelId} />}
              {currentTab === "pricing" && <PricingTab modelId={modelId} />}
              {currentTab === "providers" && (
                <ProvidersTab
                  modelId={modelId}
                  model={model}
                  onModelChange={(m) => setModel(m)}
                  providers={providers}
                />
              )}
            </div>

            {error && <p className="text-red-500 text-sm">Error: {error}</p>}

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </>
        ) : (
          <p className="text-center py-8">Error loading model.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
