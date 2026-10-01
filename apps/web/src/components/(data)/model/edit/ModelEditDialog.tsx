"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
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
import { toast } from "sonner"
import { updateModel } from "@/app/(dashboard)/models/actions"
import { fetchAdminModelEditorSource, fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"
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
  organisation_id: string | null
  hidden: boolean
  license: string | null
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

const MODEL_EDITOR_TABS = ["basic", "details", "benchmarks", "pricing", "providers"] as const

export default function ModelEditDialog({ modelId, tab }: ModelEditDialogProps) {
  const tEditor = useTranslations("Common.ui.modelEditor")
  const tActions = useTranslations("Common.ui.actions")
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState<ModelData | null>(null)
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([])
  const [detailRows, setDetailRows] = useState<Array<{ id?: string; detail_name: string; detail_value: string }>>([])
  const [linkRows, setLinkRows] = useState<Array<{ id?: string; platform: string; kind?: string; title?: string; url: string }>>([])
  const [detailsTouched, setDetailsTouched] = useState(false)
  const [linksTouched, setLinksTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("basic")

  const fetchBasicData = useCallback(async () => {
    const [source, options] = await Promise.all([fetchAdminModelEditorSource(modelId), fetchAdminModelFormOptions()])
    setModel(source.model as ModelData)
    if (options.providers) {
      setProviders(options.providers.map((p: any) => ({
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

    const savePromise = updateModel({
        modelId,
          name: model.name ?? undefined,
          organisation_id: model.organisation_id,
          hidden: Boolean(model.hidden),
          license: model.license,
          status: model.status,
          announcement_date: model.announcement_date,
          release_date: model.release_date,
          deprecation_date: model.deprecation_date,
          retirement_date: model.retirement_date,
          input_types: model.input_types,
          output_types: model.output_types,
          previous_model_id: model.previous_model_id,
          family_id: model.family_id,
          model_details: detailsTouched
            ? detailRows.map((row) => ({
                detail_name: row.detail_name,
                detail_value: row.detail_value,
              }))
            : undefined,
          links: linksTouched
            ? linkRows.map((row) => ({
                platform: row.platform,
                kind: row.kind,
                title: row.title,
                url: row.url,
              }))
            : undefined,
      })

    toast.promise(savePromise, {
      loading: tEditor("savingModel"),
      success: tEditor("modelSaved"),
      error: tEditor("saveFailed"),
    })

    try {
      await savePromise
      setOpen(false)
    } catch (err) {
      console.error("[ModelEditDialog] Error saving:", err)
      setError(tEditor("saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const currentTab = MODEL_EDITOR_TABS.find((value) => value === activeTab) ?? "basic"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tEditor("dialogTitle")}</DialogTitle>
          <DialogDescription>{tEditor("dialogDescription")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : model ? (
          <>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-48 justify-between" />}>

                    {tEditor(`tabs.${currentTab}` as never)}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />

                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {MODEL_EDITOR_TABS.map((value) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setActiveTab(value)}
                      className={currentTab === value ? "font-medium" : ""}
                    >
                      {tEditor(`tabs.${value}` as never)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {tEditor(`tabHelpers.${currentTab}` as never)}
              </span>
            </div>

            <div className="mt-4">
              {currentTab === "basic" && (
                <BasicTab model={model} onModelChange={(m) => setModel(m)} />
              )}
              {currentTab === "details" && (
                <DetailsTab
                  modelId={modelId}
                  model={model}
                  onModelChange={(m) => setModel(m)}
                  onDetailsChange={(rows) => {
                    setDetailsTouched(true)
                    setDetailRows(rows)
                  }}
                  onLinksChange={(rows) => {
                    setLinksTouched(true)
                    setLinkRows(rows)
                  }}
                />
              )}
              {currentTab === "benchmarks" && <BenchmarksTab modelId={modelId} />}
              {currentTab === "pricing" && <PricingTab modelId={modelId} />}
              {currentTab === "providers" && (
                <ProvidersTab
                  modelId={modelId}
                  providers={providers}
                />
              )}
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>{tEditor("cancel")}</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? tEditor("savingModel") : tActions("save")}</Button>
            </div>
          </>
        ) : (
          <p className="text-center py-8">{tEditor("loadingError")}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
