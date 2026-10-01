"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { CreditCard } from "lucide-react"
import { Logo } from "@/components/Logo"

import { Button } from "@/components/ui/button"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createAdminSubscriptionPlan, fetchAdminModelEditorSource, fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"

export type SubscriptionPlanModelPayload = {
  plan_uuid: string
  effective_to?: string | null
  model_info?: unknown
  rate_limit?: unknown
  other_info?: unknown
}

type PlanOption = {
  organisation_id?: string | null
  plan_uuid: string
  plan_id: string | null
  name: string | null
  frequency: string | null
  price: number | null
  currency: string | null
}

interface SubscriptionPlansTabProps {
  modelId: string
  onSubscriptionPlanModelsChange?: (
    rows: SubscriptionPlanModelPayload[]
  ) => void
}

function formatPlanLabel(plan: PlanOption, frequencyLabel: (value: string) => string): string {
  const name = plan.name?.trim() || plan.plan_id?.trim() || plan.plan_uuid
  const frequency = plan.frequency?.trim() ? frequencyLabel(plan.frequency.trim()) : null
  const price =
    typeof plan.price === "number" && Number.isFinite(plan.price)
      ? `${plan.price}${plan.currency ? ` ${plan.currency}` : ""}`
      : null
  const details = [frequency, price].filter(Boolean).join(" | ")
  return details ? `${name} (${details})` : name
}

export default function SubscriptionPlansTab({
  modelId,
  onSubscriptionPlanModelsChange,
}: SubscriptionPlansTabProps) {
  const t = useTranslations("Common.ui.modelEditor")
  const periodT = useTranslations("Catalogue.modelDetail.sections")
  const pricingT = useTranslations("Common.ui.versionedPricing")
  const frequencyLabel = (value: string) => {
    const key = ({ monthly: "monthly", quarterly: "quarterly", yearly: "yearly", weekly: "weekly", daily: "daily", usage: "usageBased", custom: "customPricing" } as Record<string, string>)[value];
    return key ? periodT(key as never) : value === "one-time" ? t("oneTime") : value;
  }
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [modelOrganisationId, setModelOrganisationId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [selectedRows, setSelectedRows] = useState<
    Record<string, SubscriptionPlanModelPayload>
  >({})
  const [newPlanId, setNewPlanId] = useState("")
  const [newPlanName, setNewPlanName] = useState("")
  const [newPlanFrequency, setNewPlanFrequency] = useState("monthly")
  const [newPlanPrice, setNewPlanPrice] = useState("0")
  const [newPlanCurrency, setNewPlanCurrency] = useState("USD")
  const [creatingPlan, setCreatingPlan] = useState(false)
  const onSubscriptionPlanModelsChangeRef = useRef(onSubscriptionPlanModelsChange)

  useEffect(() => {
    onSubscriptionPlanModelsChangeRef.current = onSubscriptionPlanModelsChange
  }, [onSubscriptionPlanModelsChange])

  useEffect(() => {
    const fetchData = async () => {
      setLoaded(false)
      const [source, options] = await Promise.all([fetchAdminModelEditorSource(modelId), fetchAdminModelFormOptions()])
      const plansData = options.subscriptionPlans ?? []
      const linkedData = (source.subscriptionPlans ?? []).map((plan: any) => ({
        plan_uuid: plan.plan_uuid,
        effective_to: plan.effective_to ?? null,
        model_info: plan.model_info?.model_info,
        rate_limit: plan.model_info?.rate_limit,
        other_info: plan.model_info?.other_info,
      }))

      setPlans(plansData as PlanOption[])
      setModelOrganisationId(source.model?.organisation_id ?? null)

      const nextSelected: Record<string, SubscriptionPlanModelPayload> = {}
      for (const row of linkedData ?? []) {
        if (!row?.plan_uuid) continue
        nextSelected[row.plan_uuid] = {
          plan_uuid: row.plan_uuid,
          effective_to: row.effective_to,
          model_info:
            row.model_info && typeof row.model_info === "object"
              ? row.model_info
              : {},
          rate_limit:
            row.rate_limit && typeof row.rate_limit === "object"
              ? row.rate_limit
              : {},
          other_info:
            row.other_info && typeof row.other_info === "object"
              ? row.other_info
              : {},
        }
      }
      setSelectedRows(nextSelected)
      setLoaded(true)
    }

    void fetchData()
  }, [modelId])

  const selectedList = useMemo(
    () => Object.values(selectedRows),
    [selectedRows]
  )

  useEffect(() => {
    if (!loaded) return
    onSubscriptionPlanModelsChangeRef.current?.(selectedList)
  }, [loaded, selectedList])

  const togglePlan = (plan: PlanOption, enabled: boolean) => {
    setSelectedRows((prev) => {
      if (!enabled) {
        return { ...prev, [plan.plan_uuid]: { ...prev[plan.plan_uuid], plan_uuid: plan.plan_uuid, effective_to: new Date().toISOString() } }
      }

      return {
        ...prev,
        [plan.plan_uuid]:
          prev[plan.plan_uuid] ?? {
            plan_uuid: plan.plan_uuid,
            model_info: {},
            rate_limit: {},
            other_info: {},
          },
      }
    })
  }

  const handleCreatePlan = async () => {
    const planId = newPlanId.trim()
    const name = newPlanName.trim()
    if (!planId || !name) return

    const priceValue = Number(newPlanPrice)
    const frequency = newPlanFrequency.trim() || "monthly"
    const currency = newPlanCurrency.trim() || "USD"
    const plan_uuid = crypto.randomUUID()
    const newPlan: PlanOption = {
      plan_uuid,
      organisation_id: modelOrganisationId,
      plan_id: planId,
      name,
      frequency,
      price: Number.isFinite(priceValue) ? priceValue : 0,
      currency,
    }

    setCreatingPlan(true)
    try {
      await createAdminSubscriptionPlan({ plan_uuid, plan_id: planId, name, frequency, price: newPlan.price ?? 0, currency, organisation_id: modelOrganisationId })
      setPlans((prev) =>
        [...prev, newPlan].sort((a, b) =>
          formatPlanLabel(a, frequencyLabel).localeCompare(formatPlanLabel(b, frequencyLabel), undefined, {
            sensitivity: "base",
          })
        )
      )
      togglePlan(newPlan, true)
      setNewPlanId("")
      setNewPlanName("")
      setNewPlanFrequency("monthly")
      setNewPlanPrice("0")
      setNewPlanCurrency("USD")
    } catch { /* Keep the draft values available for retry. */ }
    setCreatingPlan(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4" aria-hidden />{t("subscriptionPlansTitle")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("planMembershipDescription")}
        </p>
      </div>

      <SearchableSelect label={t("addPlan")} placeholder={t("findPlan")} value="" options={plans.filter((plan) => !selectedRows[plan.plan_uuid]).map((plan) => ({ value: plan.plan_uuid, label: formatPlanLabel(plan, frequencyLabel), icon: plan.organisation_id ? <Logo id={plan.organisation_id} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> : <CreditCard className="size-5 shrink-0 text-muted-foreground" /> }))} onValueChange={(value) => { const plan = plans.find((plan) => plan.plan_uuid === value); if (plan) togglePlan(plan, true); }} />
      <div className="space-y-2 border-t pt-4">
        {selectedList.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPlanMemberships")}</p>
        ) : null}
        {plans.filter((plan) => selectedRows[plan.plan_uuid]).map((plan) => {
          const membership = selectedRows[plan.plan_uuid]
          return (
            <div key={plan.plan_uuid} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
              <span className="flex min-w-0 flex-1 items-center gap-3">{plan.organisation_id ? <Logo id={plan.organisation_id} alt="" width={24} height={24} className="size-6 shrink-0 object-contain" /> : <CreditCard className="size-5 shrink-0 text-muted-foreground" />}{formatPlanLabel(plan, frequencyLabel)}</span>
              {membership ? <div className="flex flex-wrap items-center gap-2"><DatePickerInput value={membership.effective_to?.slice(0, 10) ?? ""} placeholder={t("noEndDate")} onChange={(value) => setSelectedRows((rows) => ({ ...rows, [plan.plan_uuid]: { ...membership, effective_to: value ? `${value}T00:00:00Z` : null } }))} /><Button variant="ghost" disabled={Boolean(membership.effective_to)} onClick={() => togglePlan(plan, false)}>{membership.effective_to ? t("endDated") : t("endNow")}</Button></div> : <Button variant="outline" onClick={() => togglePlan(plan, true)}>{t("add")}</Button>}
            </div>
          )
        })}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label className="text-sm font-semibold">{t("createAndAttachPlan")}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={newPlanId}
            onChange={(event) => setNewPlanId(event.target.value)}
            placeholder="plan_id"
          />
          <Input
            value={newPlanName}
            onChange={(event) => setNewPlanName(event.target.value)}
            placeholder={t("planName")}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <SearchableSelect label={t("billingFrequency")} value={newPlanFrequency} options={["monthly", "quarterly", "yearly", "weekly", "daily", "one-time", "usage", "custom"].map((value) => ({ value, label: frequencyLabel(value) }))} onValueChange={setNewPlanFrequency} />
          <Input
            value={newPlanPrice}
            onChange={(event) => setNewPlanPrice(event.target.value)}
            placeholder="0"
            type="number"
            step="0.01"
          />
          <SearchableSelect label={pricingT("currency")} value={newPlanCurrency} options={["USD", "EUR", "GBP", "CAD", "AUD", "CNY", "JPY"].map((value) => ({ value, label: value }))} onValueChange={setNewPlanCurrency} />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreatePlan}
            disabled={creatingPlan || !newPlanId.trim() || !newPlanName.trim()}
          >
            {creatingPlan ? t("creating") : t("createAndAttach")}
          </Button>
        </div>
      </div>
    </div>
  )
}
