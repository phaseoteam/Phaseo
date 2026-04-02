"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import {
  revalidateModelApiInfoTags,
  revalidateModelDataOnlyTags,
  revalidateModelDataTags,
} from "@/lib/cache/revalidateDataTags"

const CORE_TYPE_OPTIONS = ["text", "image", "audio", "video"] as const
const MODEL_DETAIL_NAME_OPTIONS = [
  "input_context_length",
  "output_context_length",
  "knowledge_cutoff",
  "parameter_count",
  "training_tokens",
] as const
const MODEL_LINK_PLATFORM_OPTIONS = [
  "announcement",
  "api_reference",
  "model_card",
  "paper",
  "playground",
  "repository",
  "weights",
] as const
const NUMERIC_ONLY_DETAIL_NAME_OPTIONS = ["parameter_count", "training_tokens"] as const

function normalizeCoreTypes(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null

  const selected = new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is (typeof CORE_TYPE_OPTIONS)[number] =>
        CORE_TYPE_OPTIONS.includes(item as (typeof CORE_TYPE_OPTIONS)[number])
      )
  )
  const normalized = CORE_TYPE_OPTIONS.filter((type) => selected.has(type))
  return normalized.length ? normalized.join(",") : null
}

function normalizeModelDetailName(
  value: string | null | undefined
): (typeof MODEL_DETAIL_NAME_OPTIONS)[number] | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return MODEL_DETAIL_NAME_OPTIONS.includes(
    normalized as (typeof MODEL_DETAIL_NAME_OPTIONS)[number]
  )
    ? (normalized as (typeof MODEL_DETAIL_NAME_OPTIONS)[number])
    : null
}

function normalizeModelLinkPlatform(
  value: string | null | undefined
): (typeof MODEL_LINK_PLATFORM_OPTIONS)[number] | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return MODEL_LINK_PLATFORM_OPTIONS.includes(
    normalized as (typeof MODEL_LINK_PLATFORM_OPTIONS)[number]
  )
    ? (normalized as (typeof MODEL_LINK_PLATFORM_OPTIONS)[number])
    : null
}

function normalizeModelDetailValue(
  detailName: (typeof MODEL_DETAIL_NAME_OPTIONS)[number],
  rawValue: string | number | null | undefined
): string | null {
  const value =
    rawValue === undefined || rawValue === null ? "" : rawValue.toString().trim()
  if (!value) return null

  if (
    NUMERIC_ONLY_DETAIL_NAME_OPTIONS.includes(
      detailName as (typeof NUMERIC_ONLY_DETAIL_NAME_OPTIONS)[number]
    )
  ) {
    const digitsOnly = value.replace(/[^\d]/g, "")
    if (!digitsOnly) return null
    return digitsOnly.replace(/^0+(?=\d)/, "")
  }

  return value
}

export interface ModelUpdatePayload {
  modelId: string
  name?: string
  organisation_id?: string | null
  license?: string | null
  hidden?: boolean
  status?: string | null
  announcement_date?: string | null
  release_date?: string | null
  deprecation_date?: string | null
  retirement_date?: string | null
  input_types?: string | null
  output_types?: string | null
  previous_model_id?: string | null
  family_id?: string | null
  model_details?: Array<{ id?: string; detail_name: string; detail_value: string | number | null }>
  links?: Array<{ id?: string; platform: string; url: string }>
  benchmark_results?: Array<{
    id?: string
    benchmark_id: string
    score: string | number | null
    is_self_reported?: boolean
    other_info?: string | null
    source_link?: string | null
    variant?: string | null
    rank?: number | null
  }>
  pricing_rules?: Array<{
    id?: string
    provider_id: string
    api_model_id: string
    capability_id: string
    pricing_plan?: string
    meter: string
    unit?: string
    unit_size?: number
    price_per_unit: string | number
    currency?: string
    note?: string | null
    priority?: number
    effective_from?: string | null
    effective_to?: string | null
    match?: Array<{
      path: string
      op: string
      value?: unknown
      and_index?: number
      or_group?: number
    }>
  }>
  provider_models?: Array<{
    id?: string
    provider_id: string
    api_model_id: string
    provider_model_slug?: string | null
    prompt_training_policy_override?: string | null
    prompt_training_override_notes?: string | null
    prompt_training_override_source_url?: string | null
    is_active_gateway?: boolean
    input_modalities?: string | null
    output_modalities?: string | null
    quantization_scheme?: string | null
    effective_from?: string | null
    effective_to?: string | null
  }>
  provider_capabilities?: Array<{
    provider_id: string
    api_model_id: string
    capability_id: string
    status?: "active" | "deranked" | "disabled" | null
    max_input_tokens?: number | null
    max_output_tokens?: number | null
    effective_from?: string | null
    effective_to?: string | null
    notes?: string | null
    params?: Record<string, unknown> | null
  }>
  aliases?: Array<{ alias_slug: string; is_enabled?: boolean; channel?: string | null; notes?: string | null }>
  family?: {
    family_id?: string | null
    family_name?: string
    family_description?: string | null
  }
  subscription_plan_models?: Array<{
    plan_uuid: string
    model_info?: unknown
    rate_limit?: unknown
    other_info?: unknown
  }>
}

function buildProviderApiModelId(providerId: string, apiModelId: string) {
  return `${providerId}:${apiModelId}:chat/completions`
}

function buildPricingModelKey(
  providerId: string,
  apiModelId: string,
  capabilityId: string
) {
  return `${providerId}:${apiModelId}:${capabilityId || "text.generate"}`
}

function inferOrganisationIdFromApiModelId(modelId: string): string | null {
  const [provider] = modelId.split("/")
  const normalized = provider?.trim().toLowerCase()
  return normalized ? normalized : null
}

type ProviderPair = { provider_id: string; api_model_id: string }

function dedupeProviderPairs(pairs: ProviderPair[]): ProviderPair[] {
  const byPair = new Map<string, ProviderPair>()
  for (const pair of pairs) {
    const provider = pair.provider_id?.trim()
    const apiModel = pair.api_model_id?.trim()
    if (!provider || !apiModel) continue
    byPair.set(`${provider}:::${apiModel}`, {
      provider_id: provider,
      api_model_id: apiModel,
    })
  }
  return Array.from(byPair.values())
}

async function deletePricingRulesForProviderPairs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pairs: ProviderPair[]
) {
  const uniquePairs = dedupeProviderPairs(pairs)
  for (const pair of uniquePairs) {
    const modelKeyPrefix = `${pair.provider_id}:${pair.api_model_id}:`
    const { error } = await supabase
      .from("data_api_pricing_rules")
      .delete()
      .gte("model_key", modelKeyPrefix)
      .lt("model_key", `${modelKeyPrefix}\uffff`)

    if (error) {
      console.error("[updateModel] Error deleting pricing rules for pair:", pair, error)
      throw new Error(error.message)
    }
  }
}

export async function updateModel(payload: ModelUpdatePayload) {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user

  if (!authUser) {
    throw new Error("Not authenticated")
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authUser.id)
    .single()

  if (userError || userData?.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  const {
    modelId,
    name,
    organisation_id,
    license,
    hidden,
    status,
    announcement_date,
    release_date,
    deprecation_date,
    retirement_date,
    input_types,
    output_types,
    previous_model_id,
    family_id,
    model_details,
    links,
    benchmark_results,
    pricing_rules,
    provider_models,
    provider_capabilities,
    aliases,
    family,
    subscription_plan_models,
  } = payload

  const nowIso = new Date().toISOString()
  const normalizedInputTypes = normalizeCoreTypes(input_types)
  const normalizedOutputTypes = normalizeCoreTypes(output_types)

  const modelUpdate: Record<string, any> = {
    updated_at: nowIso,
  }

  if (name !== undefined) modelUpdate.name = name
  if (organisation_id === null) {
    throw new Error("organisation_id is required")
  }
  if (organisation_id !== undefined) modelUpdate.organisation_id = organisation_id
  if (license !== undefined) modelUpdate.license = license
  if (hidden !== undefined) modelUpdate.hidden = hidden
  if (status !== undefined) modelUpdate.status = status
  if (announcement_date !== undefined) modelUpdate.announcement_date = announcement_date
  if (release_date !== undefined) modelUpdate.release_date = release_date
  if (deprecation_date !== undefined) modelUpdate.deprecation_date = deprecation_date
  if (retirement_date !== undefined) modelUpdate.retirement_date = retirement_date
  if (normalizedInputTypes !== undefined) modelUpdate.input_types = normalizedInputTypes
  if (normalizedOutputTypes !== undefined) modelUpdate.output_types = normalizedOutputTypes
  if (previous_model_id !== undefined) modelUpdate.previous_model_id = previous_model_id
  if (family_id !== undefined) modelUpdate.family_id = family_id

  const { data: existingModelRow } = await supabase
    .from("data_models")
    .select("organisation_id,name")
    .eq("model_id", modelId)
    .maybeSingle()
  if (!existingModelRow) {
    throw new Error(`Model not found: ${modelId}`)
  }

  const canonicalOrganisationId =
    (organisation_id && organisation_id.trim()) ||
    (existingModelRow.organisation_id && existingModelRow.organisation_id.trim()) ||
    inferOrganisationIdFromApiModelId(modelId)

  if (!canonicalOrganisationId) {
    throw new Error("Could not infer organisation_id for canonical api model")
  }

  const canonicalDisplayName =
    (name && name.trim()) ||
    (existingModelRow.name && existingModelRow.name.trim()) ||
    modelId

  const { error: apiModelError } = await supabase
    .from("data_api_models")
    .upsert(
      {
        api_model_id: modelId,
        organisation_id: canonicalOrganisationId,
        display_name: canonicalDisplayName,
        updated_at: nowIso,
      },
      { onConflict: "api_model_id" }
    )

  if (apiModelError) {
    console.error("[updateModel] Error upserting data_api_models:", apiModelError)
    throw new Error(apiModelError.message)
  }

  const { error: modelError } = await supabase
    .from("data_models")
    .update(modelUpdate)
    .eq("model_id", modelId)

  if (modelError) {
    console.error("[updateModel] Error updating model:", modelError)
    throw new Error(modelError.message)
  }

  if (model_details !== undefined) {
    const { error: deleteDetailsError } = await supabase
      .from("data_model_details")
      .delete()
      .eq("model_id", modelId)

    if (deleteDetailsError) {
      console.error("[updateModel] Error deleting old details:", deleteDetailsError)
      throw new Error(deleteDetailsError.message)
    }

    if (model_details.length > 0) {
      const detailsToInsert = model_details
        .map((detail) => {
          const detailName = normalizeModelDetailName(detail.detail_name)
          const detailValue = detailName
            ? normalizeModelDetailValue(detailName, detail.detail_value)
            : null
          if (!detailName || !detailValue) return null
          return {
            model_id: modelId,
            detail_name: detailName,
            detail_value: detailValue,
            created_at: nowIso,
            updated_at: nowIso,
          }
        })
        .filter(
          (
            detail
          ): detail is {
            model_id: string
            detail_name: (typeof MODEL_DETAIL_NAME_OPTIONS)[number]
            detail_value: string
            created_at: string
            updated_at: string
          } => Boolean(detail)
        )

      if (detailsToInsert.length > 0) {
        const { error: insertDetailsError } = await supabase
          .from("data_model_details")
          .insert(detailsToInsert)

        if (insertDetailsError) {
          console.error("[updateModel] Error inserting details:", insertDetailsError)
          throw new Error(insertDetailsError.message)
        }
      }
    }
  }

  if (links !== undefined) {
    const { error: deleteLinksError } = await supabase
      .from("data_model_links")
      .delete()
      .eq("model_id", modelId)

    if (deleteLinksError) {
      console.error("[updateModel] Error deleting old links:", deleteLinksError)
      throw new Error(deleteLinksError.message)
    }

    if (links.length > 0) {
      const linksToInsert = links
        .map((link) => {
          const platform = normalizeModelLinkPlatform(link.platform)
          const url = link.url?.trim() ?? ""
          if (!platform || !url) return null
          return {
            model_id: modelId,
            platform,
            url,
            created_at: nowIso,
            updated_at: nowIso,
          }
        })
        .filter(
          (
            link
          ): link is {
            model_id: string
            platform: (typeof MODEL_LINK_PLATFORM_OPTIONS)[number]
            url: string
            created_at: string
            updated_at: string
          } => Boolean(link)
        )

      if (linksToInsert.length > 0) {
        const { error: insertLinksError } = await supabase
          .from("data_model_links")
          .insert(linksToInsert)

        if (insertLinksError) {
          console.error("[updateModel] Error inserting links:", insertLinksError)
          throw new Error(insertLinksError.message)
        }
      }
    }
  }

  if (benchmark_results !== undefined) {
    const { error: deleteBenchmarksError } = await supabase
      .from("data_benchmark_results")
      .delete()
      .eq("model_id", modelId)

    if (deleteBenchmarksError) {
      console.error("[updateModel] Error replacing benchmarks:", deleteBenchmarksError)
      throw new Error(deleteBenchmarksError.message)
    }

    const benchmarkRowsToInsert = benchmark_results
      .filter((result) => result.benchmark_id?.trim())
      .map((result) => ({
        model_id: modelId,
        benchmark_id: result.benchmark_id.trim(),
        score: result.score?.toString() ?? "",
        is_self_reported: result.is_self_reported ?? false,
        other_info: result.other_info?.trim() || null,
        source_link: result.source_link?.trim() || null,
        variant: result.variant?.trim() || null,
        rank: result.rank ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      }))

    if (benchmarkRowsToInsert.length > 0) {
      const { error: insertBenchmarksError } = await supabase
        .from("data_benchmark_results")
        .insert(benchmarkRowsToInsert)

      if (insertBenchmarksError) {
        console.error("[updateModel] Error inserting benchmark replacements:", insertBenchmarksError)
        throw new Error(insertBenchmarksError.message)
      }
    }
  }

  const normalizedPricingRules =
    pricing_rules === undefined
      ? undefined
      : pricing_rules
          .filter((rule) => rule.provider_id && rule.meter)
          .map((rule) => {
            const capabilityId = rule.capability_id?.trim() || "text.generate"
            const unitSize = Number(rule.unit_size ?? 1)
            const pricePerUnit = Number(rule.price_per_unit ?? 0)
            const priority = Number(rule.priority ?? 100)
            return {
              provider_id: rule.provider_id.trim(),
              api_model_id: modelId,
              capability_id: capabilityId,
              model_key: buildPricingModelKey(
                rule.provider_id.trim(),
                modelId,
                capabilityId
              ),
              pricing_plan: rule.pricing_plan?.trim() || "standard",
              meter: rule.meter.trim(),
              unit: rule.unit?.trim() || "token",
              unit_size:
                Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
              price_per_unit: Number.isFinite(pricePerUnit) ? pricePerUnit : 0,
              currency: rule.currency?.trim() || "USD",
              note: rule.note?.trim() || null,
              match: Array.isArray(rule.match) ? rule.match : [],
              priority: Number.isFinite(priority) ? priority : 100,
              effective_from: rule.effective_from ?? null,
              effective_to: rule.effective_to ?? null,
              updated_at: nowIso,
            }
          })

  if (provider_models !== undefined) {
    const { data: existingProviderModelRows, error: existingProviderModelRowsError } = await supabase
      .from("data_api_provider_models")
      .select("provider_api_model_id, provider_id, api_model_id")
      .eq("model_id", modelId)

    if (existingProviderModelRowsError) {
      console.error("[updateModel] Error loading existing provider models:", existingProviderModelRowsError)
      throw new Error(existingProviderModelRowsError.message)
    }

    const existingProviderApiModelIds = (existingProviderModelRows ?? []).map(
      (row) => row.provider_api_model_id
    )
    if (existingProviderApiModelIds.length > 0) {
      const { error: deleteChildCapabilitiesError } = await supabase
        .from("data_api_provider_model_capabilities")
        .delete()
        .in("provider_api_model_id", existingProviderApiModelIds)

      if (deleteChildCapabilitiesError) {
        console.error("[updateModel] Error deleting provider capability children:", deleteChildCapabilitiesError)
        throw new Error(deleteChildCapabilitiesError.message)
      }
    }

    const existingProviderPairs = dedupeProviderPairs(
      (existingProviderModelRows ?? []).map((row) => ({
        provider_id: row.provider_id,
        api_model_id: row.api_model_id,
      }))
    )

    const { error: deleteProvidersError } = await supabase
      .from("data_api_provider_models")
      .delete()
      .eq("model_id", modelId)

    if (deleteProvidersError) {
      console.error("[updateModel] Error replacing provider models:", deleteProvidersError)
      throw new Error(deleteProvidersError.message)
    }

    const providerRows = provider_models
      .filter((pm) => pm.provider_id)
      .map((pm) => ({
        api_model_id: modelId,
        provider_api_model_id:
          pm.id && !pm.id.startsWith("new-")
            ? pm.id
            : buildProviderApiModelId(pm.provider_id, modelId),
        provider_id: pm.provider_id,
        provider_model_slug: pm.provider_model_slug ?? null,
        prompt_training_policy_override: pm.prompt_training_policy_override ?? null,
        prompt_training_override_notes: pm.prompt_training_override_notes ?? null,
        prompt_training_override_source_url:
          pm.prompt_training_override_source_url ?? null,
        internal_model_id: null,
        is_active_gateway: pm.is_active_gateway ?? false,
        input_modalities: pm.input_modalities ?? null,
        output_modalities: pm.output_modalities ?? null,
        quantization_scheme: pm.quantization_scheme ?? null,
        effective_from: pm.effective_from ?? null,
        effective_to: pm.effective_to ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      }))

    const incomingProviderPairs = dedupeProviderPairs(
      providerRows.map((row) => ({
        provider_id: row.provider_id,
        api_model_id: row.api_model_id,
      }))
    )
    const incomingPairKeys = new Set(
      incomingProviderPairs.map((pair) => `${pair.provider_id}:::${pair.api_model_id}`)
    )
    const removedProviderPairs = existingProviderPairs.filter(
      (pair) => !incomingPairKeys.has(`${pair.provider_id}:::${pair.api_model_id}`)
    )
    if (removedProviderPairs.length > 0) {
      await deletePricingRulesForProviderPairs(supabase, removedProviderPairs)
    }

    if (providerRows.length > 0) {
      const { error: insertProvidersError } = await supabase
        .from("data_api_provider_models")
        .upsert(providerRows, { onConflict: "provider_api_model_id" })

      if (insertProvidersError) {
        console.error("[updateModel] Error inserting provider models:", insertProvidersError)
        throw new Error(insertProvidersError.message)
      }
    }
  }

  if (provider_capabilities !== undefined) {
    const { data: providerModelRows, error: providerModelsError } = await supabase
      .from("data_api_provider_models")
      .select("provider_api_model_id, provider_id, api_model_id")
      .eq("model_id", modelId)

    if (providerModelsError) {
      console.error("[updateModel] Error loading provider models for capabilities:", providerModelsError)
      throw new Error(providerModelsError.message)
    }

    const providerApiModelIds = (providerModelRows ?? []).map((row) => row.provider_api_model_id)
    const existingCapabilityWindowByKey = new Map<
      string,
      { effective_from: string | null; effective_to: string | null }
    >()
    if (providerApiModelIds.length > 0) {
      const { data: existingCapabilityRows, error: existingCapabilitiesError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, effective_from, effective_to")
        .in("provider_api_model_id", providerApiModelIds)

      if (existingCapabilitiesError) {
        console.error("[updateModel] Error loading existing provider capabilities:", existingCapabilitiesError)
        throw new Error(existingCapabilitiesError.message)
      }

      for (const row of existingCapabilityRows ?? []) {
        if (!row.capability_id) continue
        existingCapabilityWindowByKey.set(
          `${row.provider_api_model_id}:::${row.capability_id}`,
          {
            effective_from: row.effective_from ?? null,
            effective_to: row.effective_to ?? null,
          }
        )
      }
    }

    if (providerApiModelIds.length > 0) {
      const { error: deleteCapabilitiesError } = await supabase
        .from("data_api_provider_model_capabilities")
        .delete()
        .in("provider_api_model_id", providerApiModelIds)

      if (deleteCapabilitiesError) {
        console.error("[updateModel] Error replacing provider capabilities:", deleteCapabilitiesError)
        throw new Error(deleteCapabilitiesError.message)
      }
    }

    const providerApiModelIdByPair = new Map<string, string>(
      (providerModelRows ?? []).map((row) => [
        `${row.provider_id}:${row.api_model_id}`,
        row.provider_api_model_id,
      ])
    )

    const capabilityRows = provider_capabilities
      .filter((capability) => capability.provider_id && capability.capability_id)
      .map((capability) => {
        const capabilityId = capability.capability_id.trim()
        const providerApiModelId =
          providerApiModelIdByPair.get(`${capability.provider_id}:${modelId}`) ??
          buildProviderApiModelId(capability.provider_id, modelId)
        const parsedStatus =
          capability.status === "deranked" || capability.status === "disabled"
            ? capability.status
            : "active"
        const existingWindow = existingCapabilityWindowByKey.get(
          `${providerApiModelId}:::${capabilityId || "text.generate"}`
        )

        return {
          provider_api_model_id: providerApiModelId,
          capability_id: capabilityId || "text.generate",
          status: parsedStatus,
          max_input_tokens: capability.max_input_tokens ?? null,
          max_output_tokens: capability.max_output_tokens ?? null,
          effective_from: capability.effective_from ?? existingWindow?.effective_from ?? null,
          effective_to: capability.effective_to ?? existingWindow?.effective_to ?? null,
          notes: capability.notes ?? null,
          params:
            capability.params && typeof capability.params === "object"
              ? capability.params
              : {},
          updated_at: nowIso,
        }
      })

    if (capabilityRows.length > 0) {
      const { error: capabilityUpsertError } = await supabase
        .from("data_api_provider_model_capabilities")
        .upsert(capabilityRows, {
          onConflict: "provider_api_model_id,capability_id",
        })

      if (capabilityUpsertError) {
        console.error("[updateModel] Error upserting provider capabilities:", capabilityUpsertError)
        throw new Error(capabilityUpsertError.message)
      }
    }
  }

  if (normalizedPricingRules !== undefined) {
    const pricingPairs = dedupeProviderPairs(
      normalizedPricingRules.map((rule) => ({
        provider_id: rule.provider_id,
        api_model_id: rule.api_model_id,
      }))
    )

    const { data: providerModelRows, error: providerModelsError } = await supabase
      .from("data_api_provider_models")
      .select("provider_api_model_id, provider_id, api_model_id")
      .eq("model_id", modelId)

    if (providerModelsError) {
      console.error("[updateModel] Error loading provider models for pricing:", providerModelsError)
      throw new Error(providerModelsError.message)
    }

    const providerApiModelIdByPair = new Map<string, string>(
      (providerModelRows ?? []).map((row) => [
        `${row.provider_id}:${row.api_model_id}`,
        row.provider_api_model_id,
      ])
    )

    const missingProviderRows = pricingPairs
      .filter((pair) => !providerApiModelIdByPair.has(`${pair.provider_id}:${pair.api_model_id}`))
      .map((pair) => ({
        provider_api_model_id: buildProviderApiModelId(pair.provider_id, pair.api_model_id),
        provider_id: pair.provider_id,
        api_model_id: pair.api_model_id,
        model_id: modelId,
        internal_model_id: null,
        is_active_gateway: false,
        created_at: nowIso,
        updated_at: nowIso,
      }))

    if (missingProviderRows.length > 0) {
      const { error: insertMissingProviderError } = await supabase
        .from("data_api_provider_models")
        .upsert(missingProviderRows, { onConflict: "provider_api_model_id" })

      if (insertMissingProviderError) {
        console.error(
          "[updateModel] Error creating provider models from pricing rules:",
          insertMissingProviderError
        )
        throw new Error(insertMissingProviderError.message)
      }
    }

    const { data: providerModelRowsAfter, error: providerModelsAfterError } = await supabase
      .from("data_api_provider_models")
      .select("provider_api_model_id, provider_id, api_model_id")
      .eq("model_id", modelId)

    if (providerModelsAfterError) {
      console.error(
        "[updateModel] Error reloading provider models for pricing capabilities:",
        providerModelsAfterError
      )
      throw new Error(providerModelsAfterError.message)
    }

    const providerApiModelIdByPairAfter = new Map<string, string>(
      (providerModelRowsAfter ?? []).map((row) => [
        `${row.provider_id}:${row.api_model_id}`,
        row.provider_api_model_id,
      ])
    )

    const capabilityRows = Array.from(
      new Set(
        normalizedPricingRules
          .map((rule) => {
            const providerApiModelId = providerApiModelIdByPairAfter.get(
              `${rule.provider_id}:${rule.api_model_id}`
            )
            return providerApiModelId
              ? `${providerApiModelId}:::${rule.capability_id}`
              : null
          })
          .filter((value): value is string => Boolean(value))
      )
    ).map((value) => {
      const [provider_api_model_id, capability_id] = value.split(":::")
      return {
        provider_api_model_id,
        capability_id,
        updated_at: nowIso,
      }
    })

    if (capabilityRows.length > 0) {
      const { error: capabilityUpsertError } = await supabase
        .from("data_api_provider_model_capabilities")
        .upsert(capabilityRows, {
          onConflict: "provider_api_model_id,capability_id",
        })

      if (capabilityUpsertError) {
        console.error("[updateModel] Error upserting pricing capabilities:", capabilityUpsertError)
        throw new Error(capabilityUpsertError.message)
      }
    }

    const replacementPairs = dedupeProviderPairs([
      ...(providerModelRowsAfter ?? []).map((row) => ({
        provider_id: row.provider_id,
        api_model_id: row.api_model_id,
      })),
      ...pricingPairs,
    ])
    if (replacementPairs.length > 0) {
      await deletePricingRulesForProviderPairs(supabase, replacementPairs)
    }

    if (normalizedPricingRules.length > 0) {
      const { error: insertPricingError } = await supabase
        .from("data_api_pricing_rules")
        .insert(
          normalizedPricingRules.map((rule) => ({
            model_key: rule.model_key,
            capability_id: rule.capability_id,
            pricing_plan: rule.pricing_plan,
            meter: rule.meter,
            unit: rule.unit,
            unit_size: rule.unit_size,
            price_per_unit: rule.price_per_unit,
            currency: rule.currency,
            note: rule.note,
            match: rule.match,
            priority: rule.priority,
            effective_from: rule.effective_from,
            effective_to: rule.effective_to,
            updated_at: rule.updated_at,
          }))
        )

      if (insertPricingError) {
        console.error("[updateModel] Error inserting pricing rules:", insertPricingError)
        throw new Error(insertPricingError.message)
      }
    }
  }

  if (aliases !== undefined) {
    const { error: deleteAliasesError } = await supabase
      .from("data_api_model_aliases")
      .delete()
      .eq("api_model_id", modelId)

    if (deleteAliasesError) {
      console.error("[updateModel] Error replacing aliases:", deleteAliasesError)
      throw new Error(deleteAliasesError.message)
    }

    if (aliases.length > 0) {
      const aliasesToInsert = aliases
        .filter((a) => a.alias_slug && a.alias_slug.trim() !== "")
        .map((alias) => ({
          alias_slug: alias.alias_slug.trim(),
          api_model_id: modelId,
          is_enabled: alias.is_enabled ?? true,
          channel: alias.channel?.trim() || null,
          notes: alias.notes?.trim() || null,
          updated_at: nowIso,
        }))

      if (aliasesToInsert.length > 0) {
        const { error: insertAliasesError } = await supabase
          .from("data_api_model_aliases")
          .upsert(aliasesToInsert, { onConflict: "alias_slug" })

        if (insertAliasesError) {
          console.error("[updateModel] Error inserting aliases:", insertAliasesError)
          throw new Error(insertAliasesError.message)
        }
      }
    }
  }

  if (subscription_plan_models !== undefined) {
    const { error: deletePlanModelsError } = await supabase
      .from("data_subscription_plan_models")
      .delete()
      .eq("model_id", modelId)

    if (deletePlanModelsError) {
      console.error("[updateModel] Error replacing subscription plan model links:", deletePlanModelsError)
      throw new Error(deletePlanModelsError.message)
    }

    const planModelRows = subscription_plan_models
      .filter((row) => typeof row.plan_uuid === "string" && row.plan_uuid.trim())
      .map((row) => ({
        plan_uuid: row.plan_uuid.trim(),
        model_id: modelId,
        model_info:
          row.model_info && typeof row.model_info === "object" ? row.model_info : {},
        rate_limit:
          row.rate_limit && typeof row.rate_limit === "object" ? row.rate_limit : {},
        other_info:
          row.other_info && typeof row.other_info === "object" ? row.other_info : {},
      }))

    if (planModelRows.length > 0) {
      const { error: insertPlanModelsError } = await supabase
        .from("data_subscription_plan_models")
        .upsert(planModelRows, { onConflict: "plan_uuid,model_id" })

      if (insertPlanModelsError) {
        console.error("[updateModel] Error upserting subscription plan model links:", insertPlanModelsError)
        throw new Error(insertPlanModelsError.message)
      }
    }
  }

  if (family !== undefined) {
    if (family.family_name) {
      const familyId = family.family_id || family.family_name.toLowerCase().replace(/\s+/g, "-")
      const { error: familyError } = await supabase
        .from("data_model_families")
        .upsert({
          family_id: familyId,
          family_name: family.family_name,
          family_description: family.family_description ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "family_id" })

      if (familyError) {
        console.error("[updateModel] Error upserting family:", familyError)
        throw new Error(familyError.message)
      }

      await supabase
        .from("data_models")
        .update({ family_id: familyId })
        .eq("model_id", modelId)
    }
  }

  const previousOrganisationId = existingModelRow?.organisation_id ?? null
  const nextOrganisationId =
    modelUpdate.organisation_id !== undefined
      ? (modelUpdate.organisation_id as string | null)
      : previousOrganisationId
  revalidateModelDataTags({
    modelId,
    organisationIds: [previousOrganisationId, nextOrganisationId],
  })
  revalidatePath(`/models/**`)
  revalidatePath("/models")

  return { ok: true }
}

export async function deleteBenchmarkResult(id: string) {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user

  if (!authUser) {
    throw new Error("Not authenticated")
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authUser.id)
    .single()

  if (userError || userData?.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  const { data: benchmarkRow } = await supabase
    .from("data_benchmark_results")
    .select("model_id")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("data_benchmark_results")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateModelDataOnlyTags({ modelId: benchmarkRow?.model_id ?? null })
  revalidatePath(`/models/**`)
  return { ok: true }
}

export async function deletePricingRule(id: string) {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user

  if (!authUser) {
    throw new Error("Not authenticated")
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authUser.id)
    .single()

  if (userError || userData?.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  const { error } = await supabase
    .from("data_api_pricing_rules")
    .delete()
    .eq("rule_id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateModelApiInfoTags()
  revalidatePath(`/models/**`)
  return { ok: true }
}

export async function deleteProviderModel(id: string) {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user

  if (!authUser) {
    throw new Error("Not authenticated")
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authUser.id)
    .single()

  if (userError || userData?.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  const { data: providerModelRow } = await supabase
    .from("data_api_provider_models")
    .select("model_id")
    .eq("provider_api_model_id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("data_api_provider_models")
    .delete()
    .eq("provider_api_model_id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateModelApiInfoTags({ modelId: providerModelRow?.model_id ?? null })
  revalidatePath(`/models/**`)
  return { ok: true }
}
