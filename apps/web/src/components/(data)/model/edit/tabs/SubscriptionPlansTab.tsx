"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { createClient } from "@/utils/supabase/client"

export type SubscriptionPlanModelPayload = {
  plan_uuid: string
  model_info?: unknown
  rate_limit?: unknown
  other_info?: unknown
}

type PlanOption = {
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

function formatPlanLabel(plan: PlanOption): string {
  const name = plan.name?.trim() || plan.plan_id?.trim() || plan.plan_uuid
  const frequency = plan.frequency?.trim()
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
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedRows, setSelectedRows] = useState<
    Record<string, SubscriptionPlanModelPayload>
  >({})
  const onSubscriptionPlanModelsChangeRef = useRef(onSubscriptionPlanModelsChange)

  useEffect(() => {
    onSubscriptionPlanModelsChangeRef.current = onSubscriptionPlanModelsChange
  }, [onSubscriptionPlanModelsChange])

  useEffect(() => {
    const fetchData = async () => {
      setLoaded(false)
      const supabase = createClient()
      const [{ data: plansData }, { data: linkedData }] = await Promise.all([
        supabase
          .from("data_subscription_plans")
          .select("plan_uuid, plan_id, name, frequency, price, currency")
          .order("name", { ascending: true })
          .order("frequency", { ascending: true }),
        supabase
          .from("data_subscription_plan_models")
          .select("plan_uuid, model_info, rate_limit, other_info")
          .eq("model_id", modelId),
      ])

      setPlans((plansData ?? []) as PlanOption[])

      const nextSelected: Record<string, SubscriptionPlanModelPayload> = {}
      for (const row of linkedData ?? []) {
        if (!row?.plan_uuid) continue
        nextSelected[row.plan_uuid] = {
          plan_uuid: row.plan_uuid,
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
        const next = { ...prev }
        delete next[plan.plan_uuid]
        return next
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

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">Subscription Plans</Label>
        <p className="text-xs text-muted-foreground">
          Attach or detach this model from subscription plans.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscription plans found.</p>
        ) : null}
        {plans.map((plan) => {
          const checked = Boolean(selectedRows[plan.plan_uuid])
          return (
            <label
              key={plan.plan_uuid}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="truncate">{formatPlanLabel(plan)}</span>
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => togglePlan(plan, value === true)}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
