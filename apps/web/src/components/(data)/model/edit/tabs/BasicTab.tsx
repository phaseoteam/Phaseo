"use client"

import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MODEL_MODALITY_OPTIONS,
  MODEL_STATUS_OPTIONS,
  normalizeModelStatus,
} from "@/lib/models/editorOptions"
import { cn } from "@/lib/utils"
import { fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"
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

const TYPE_OPTIONS = MODEL_MODALITY_OPTIONS

const MODALITY_TRANSLATION_KEYS: Record<string, string> = {
	text: "text",
	image: "image",
	video: "video",
	audio: "audio",
	audio_stt: "audioStt",
	audio_tts: "audioTts",
	audio_music: "audioMusic",
	file: "file",
	embeddings: "embeddings",
	code: "code",
	vision: "vision",
	speech: "speech",
	multimodal: "multimodal",
	embedding: "embedding",
	rerank: "rerank",
	moderation: "moderation",
}

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
	Rumoured: "rumoured",
	Announced: "announced",
	Preview: "preview",
	"Limited Access": "limitedAccess",
	Withheld: "withheld",
	Released: "released",
	Deprecated: "deprecated",
	Retired: "retired",
}

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

function FieldRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string
  description?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <div className="space-y-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  )
}

export default function BasicTab({ model, onModelChange }: BasicTabProps) {
  const tUi = useTranslations("Common.ui")
  const tEditor = useTranslations("Common.ui.modelEditor")
  const tModel = useTranslations("Common.ui.modelCreation")
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([])
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([])
  const [families, setFamilies] = useState<FamilyOption[]>([])

  useEffect(() => {
    const fetchOptions = async () => {
      const options = await fetchAdminModelFormOptions()
      const modelsData = options.previousModels ?? []
      const organisationData = options.organisations ?? []
      const familyData = options.families ?? []

      setExistingModels(modelsData.filter((item: any) => item.model_id !== model.model_id).map((item: any) => ({
        model_id: item.model_id,
        name: item.name || item.model_id,
      })))
      setOrganisations(organisationData as OrganisationOption[])
      setFamilies(familyData as FamilyOption[])
    }
    void fetchOptions()
  }, [model.model_id])

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
    <div className="space-y-5">
      <section className="rounded-lg border p-4 space-y-4">
        <div className="text-sm font-semibold">{tEditor("identity")}</div>
        <FieldRow label={tModel("displayName")}>
          <Input
            value={model.name || ""}
            onChange={(event) => onModelChange({ ...model, name: event.target.value })}
          />
        </FieldRow>
        <FieldRow label={tModel("organization")}>
          <SearchableSelect label={tModel("organization")} value={model.organisation_id || ""} placeholder={tModel("selectOrganization")} options={organisations.map((item) => ({ value: item.organisation_id, label: item.name || item.organisation_id, icon: <Logo id={item.organisation_id} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} onValueChange={(value) => onModelChange({ ...model, organisation_id: value === "__none__" ? null : value })} />
        </FieldRow>
        <FieldRow label={tModel("status")}>
          <Select
            value={normalizeModelStatus(model.status)}
            onValueChange={(value) => onModelChange({ ...model, status: value })}
          >
            <SelectTrigger><SelectValue>{normalizeModelStatus(model.status)}</SelectValue></SelectTrigger>
            <SelectContent>
              {MODEL_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {tEditor(`modelStatuses.${STATUS_TRANSLATION_KEYS[status]}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label={tEditor("license")}>
          <SearchableSelect label={tEditor("license")} value={model.license || "unspecified"} options={[{ value: "unspecified", label: tEditor("notSpecified") }, ...[...new Set(["Apache-2.0", "MIT", "BSD-3-Clause", "CC-BY-4.0", "CC-BY-NC-4.0", "OpenRAIL", "Proprietary", ...(model.license ? [model.license] : [])])].map((value) => ({ value, label: value === "Proprietary" ? tEditor("proprietary") : value }))]} onValueChange={(value) => onModelChange({ ...model, license: value === "unspecified" ? null : value })} />
        </FieldRow>
        <FieldRow
          label={tEditor("visibility")}
          description={tEditor("visibilityDescription")}
        >
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Checkbox
              checked={Boolean(model.hidden)}
              onCheckedChange={(checked) => onModelChange({ ...model, hidden: checked === true })}
            />
            {tModel("hidden")}
          </label>
        </FieldRow>
      </section>

      <section className="rounded-lg border p-4 space-y-4">
        <div className="text-sm font-semibold">{tEditor("relationships")}</div>
        <FieldRow label={tEditor("previousModel")}>
          <SearchableSelect label={tEditor("previousModel")} value={model.previous_model_id || "__none__"} options={[{ value: "__none__", label: tUi("select.none") }, ...existingModels.map((item) => ({ value: item.model_id, label: item.name || item.model_id, icon: <Logo id={item.model_id.split("/")[0]} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))]} onValueChange={(value) => onModelChange({ ...model, previous_model_id: value === "__none__" ? null : value })} />
        </FieldRow>
        <FieldRow
          label={tEditor("recommendedSuccessor")}
          description={tEditor("recommendedSuccessorDescription")}
          htmlFor="recommended-successor"
        >
          <Select
            value={model.replacement_model_id || "__none__"}
            onValueChange={(value) =>
              onModelChange({
                ...model,
                replacement_model_id: value === "__none__" ? null : value,
              })
            }
          >
            <SelectTrigger id="recommended-successor">
              <SelectValue placeholder={tEditor("selectRecommendedSuccessor")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{tUi("select.none")}</SelectItem>
              {existingModels.map((existingModel) => (
                <SelectItem key={existingModel.model_id} value={existingModel.model_id}>
                  {existingModel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label={tEditor("modelFamily")}>
          <SearchableSelect label={tEditor("modelFamily")} value={model.family_id || "__none__"} options={[{ value: "__none__", label: tUi("select.none") }, ...families.map((item) => ({ value: item.family_id, label: item.family_name || item.family_id }))]} onValueChange={(value) => onModelChange({ ...model, family_id: value === "__none__" ? null : value })} />
        </FieldRow>
      </section>

      <section className="rounded-lg border p-4 space-y-4">
        <div className="text-sm font-semibold">{tEditor("lifecycle")}</div>
        <FieldRow label={tEditor("announcementDate")}>
          <DatePickerInput
            value={formatDateForInput(model.announcement_date)}
            onChange={(value) => onModelChange({ ...model, announcement_date: value || null })}
            placeholder={tEditor("announcementDate")}
          />
        </FieldRow>
        <FieldRow label={tModel("releaseDate")}>
          <DatePickerInput
            value={formatDateForInput(model.release_date)}
            onChange={(value) => onModelChange({ ...model, release_date: value || null })}
            placeholder={tModel("releaseDate")}
          />
        </FieldRow>
        <FieldRow label={tEditor("deprecationDate")}>
          <DatePickerInput
            value={formatDateForInput(model.deprecation_date)}
            onChange={(value) => onModelChange({ ...model, deprecation_date: value || null })}
            placeholder={tEditor("deprecationDate")}
          />
        </FieldRow>
        <FieldRow label={tModel("retirementDate")}>
          <DatePickerInput
            value={formatDateForInput(model.retirement_date)}
            onChange={(value) => onModelChange({ ...model, retirement_date: value || null })}
            placeholder={tModel("retirementDate")}
          />
        </FieldRow>
      </section>

      <section className="rounded-lg border p-4 space-y-4">
        <div className="text-sm font-semibold">{tEditor("modalities")}</div>
        <FieldRow label={tEditor("inputTypes")}>
          <div className="flex flex-wrap gap-2">
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
                  {tModel(`modalities.${MODALITY_TRANSLATION_KEYS[type] ?? type}` as never)}
                </Button>
              )
            })}
          </div>
        </FieldRow>
        <FieldRow label={tEditor("outputTypes")}>
          <div className="flex flex-wrap gap-2">
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
                  {tModel(`modalities.${MODALITY_TRANSLATION_KEYS[type] ?? type}` as never)}
                </Button>
              )
            })}
          </div>
        </FieldRow>
      </section>
    </div>
  )
}
