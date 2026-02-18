"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { revalidateModelDataTags } from "@/lib/cache/revalidateDataTags"

export interface ModelUpdatePayload {
  modelId: string
  name?: string
  organisation_id?: string | null
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
    tiering_mode?: string
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
    is_active_gateway?: boolean
    input_modalities?: string | null
    output_modalities?: string | null
    quantization_scheme?: string | null
    effective_from?: string | null
    effective_to?: string | null
  }>
  aliases?: Array<{ alias_slug: string; is_enabled?: boolean; channel?: string | null; notes?: string | null }>
  family?: {
    family_id?: string | null
    family_name?: string
    family_description?: string | null
  }
}

function buildProviderApiModelId(providerId: string, apiModelId: string) {
  return `${providerId}:${apiModelId}:chat/completions`
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
    aliases,
    family,
  } = payload

  const modelUpdate: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (name !== undefined) modelUpdate.name = name
  if (organisation_id !== undefined) modelUpdate.organisation_id = organisation_id
  if (hidden !== undefined) modelUpdate.hidden = hidden
  if (status !== undefined) modelUpdate.status = status
  if (announcement_date !== undefined) modelUpdate.announcement_date = announcement_date
  if (release_date !== undefined) modelUpdate.release_date = release_date
  if (deprecation_date !== undefined) modelUpdate.deprecation_date = deprecation_date
  if (retirement_date !== undefined) modelUpdate.retirement_date = retirement_date
  if (input_types !== undefined) modelUpdate.input_types = input_types
  if (output_types !== undefined) modelUpdate.output_types = output_types
  if (previous_model_id !== undefined) modelUpdate.previous_model_id = previous_model_id
  if (family_id !== undefined) modelUpdate.family_id = family_id

  const { data: existingModelRow } = await supabase
    .from("data_models")
    .select("organisation_id")
    .eq("model_id", modelId)
    .maybeSingle()

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
        .filter((d) => d.detail_name && d.detail_value !== undefined && d.detail_value !== null)
        .map((detail) => ({
          model_id: modelId,
          detail_name: detail.detail_name,
          detail_value: detail.detail_value?.toString() ?? "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

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
        .filter((link) => link.platform && link.url && link.url.trim() !== "")
        .map((link) => ({
          model_id: modelId,
          platform: link.platform,
          url: link.url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

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
    const existingIds = benchmark_results.filter((r) => r.id).map((r) => r.id)
    if (existingIds.length > 0) {
      const { error: deleteBenchmarksError } = await supabase
        .from("data_benchmark_results")
        .delete()
        .eq("model_id", modelId)
        .not("id", "in", `(${existingIds.join(",")})`)

      if (deleteBenchmarksError) {
        console.error("[updateModel] Error deleting old benchmarks:", deleteBenchmarksError)
        throw new Error(deleteBenchmarksError.message)
      }
    } else {
      const { error: deleteBenchmarksError } = await supabase
        .from("data_benchmark_results")
        .delete()
        .eq("model_id", modelId)

      if (deleteBenchmarksError) {
        console.error("[updateModel] Error deleting old benchmarks:", deleteBenchmarksError)
        throw new Error(deleteBenchmarksError.message)
      }
    }

    if (benchmark_results.length > 0) {
      for (const result of benchmark_results) {
        if (!result.benchmark_id) continue

        const benchmarkData = {
          model_id: modelId,
          benchmark_id: result.benchmark_id,
          score: result.score?.toString() ?? "",
          is_self_reported: result.is_self_reported ?? false,
          other_info: result.other_info ?? null,
          source_link: result.source_link ?? null,
          rank: result.rank ?? null,
          updated_at: new Date().toISOString(),
        }

        if (result.id) {
          const { error: updateError } = await supabase
            .from("data_benchmark_results")
            .update(benchmarkData)
            .eq("id", result.id)

          if (updateError) {
            console.error("[updateModel] Error updating benchmark:", updateError)
            throw new Error(updateError.message)
          }
        } else {
          const { error: insertError } = await supabase
            .from("data_benchmark_results")
            .insert({ ...benchmarkData, created_at: new Date().toISOString() })

          if (insertError) {
            console.error("[updateModel] Error inserting benchmark:", insertError)
            throw new Error(insertError.message)
          }
        }
      }
    }
  }

  if (pricing_rules !== undefined) {
    const existingIds = pricing_rules.filter((r) => r.id).map((r) => r.id)
    if (existingIds.length > 0) {
      const { error: deletePricingError } = await supabase
        .from("data_api_pricing_rules")
        .delete()
        .in("rule_id", existingIds)

      if (deletePricingError) {
        console.error("[updateModel] Error deleting old pricing rules:", deletePricingError)
        throw new Error(deletePricingError.message)
      }
    }

    if (pricing_rules.length > 0) {
      const rulesToInsert = pricing_rules.map((rule) => {
        const capabilityId = rule.capability_id?.trim() || "chat/completions"
        return {
          model_key: `${rule.provider_id}:${rule.api_model_id}:${capabilityId}`,
          capability_id: capabilityId,
          pricing_plan: rule.pricing_plan ?? "standard",
          meter: rule.meter,
          unit: rule.unit ?? "token",
          unit_size: rule.unit_size ?? 1,
          price_per_unit: Number(rule.price_per_unit) ?? 0,
          currency: rule.currency ?? "USD",
          tiering_mode: rule.tiering_mode ?? null,
          note: rule.note ?? null,
          match: Array.isArray(rule.match) ? rule.match : [],
          priority: rule.priority ?? 100,
          effective_from: rule.effective_from ?? null,
          effective_to: rule.effective_to ?? null,
          updated_at: new Date().toISOString(),
        }
      })

      const { error: insertPricingError } = await supabase
        .from("data_api_pricing_rules")
        .insert(rulesToInsert)

      if (insertPricingError) {
        console.error("[updateModel] Error inserting pricing rules:", insertPricingError)
        throw new Error(insertPricingError.message)
      }
    }
  }

  if (provider_models !== undefined) {
    const existingIds = provider_models.filter((r) => r.id).map((r) => r.id)
    if (existingIds.length > 0) {
      const { error: deleteProvidersError } = await supabase
        .from("data_api_provider_models")
        .delete()
        .in("provider_api_model_id", existingIds)

      if (deleteProvidersError) {
        console.error("[updateModel] Error deleting old provider models:", deleteProvidersError)
        throw new Error(deleteProvidersError.message)
      }
    }

    if (provider_models.length > 0) {
      for (const pm of provider_models) {
        const pmData = {
          provider_id: pm.provider_id,
          api_model_id: pm.api_model_id,
          provider_model_slug: pm.provider_model_slug ?? null,
          internal_model_id: modelId,
          is_active_gateway: pm.is_active_gateway ?? false,
          input_modalities: pm.input_modalities ?? null,
          output_modalities: pm.output_modalities ?? null,
          quantization_scheme: pm.quantization_scheme ?? null,
          effective_from: pm.effective_from ?? null,
          effective_to: pm.effective_to ?? null,
          updated_at: new Date().toISOString(),
        }

        if (pm.id) {
          const { error: updateError } = await supabase
            .from("data_api_provider_models")
            .update(pmData)
            .eq("provider_api_model_id", pm.id)

          if (updateError) {
            console.error("[updateModel] Error updating provider model:", updateError)
            throw new Error(updateError.message)
          }
        } else {
          const pmId = buildProviderApiModelId(pm.provider_id, pm.api_model_id)
          const { error: insertError } = await supabase
            .from("data_api_provider_models")
            .insert({ ...pmData, provider_api_model_id: pmId, created_at: new Date().toISOString() })

          if (insertError) {
            console.error("[updateModel] Error inserting provider model:", insertError)
            throw new Error(insertError.message)
          }
        }
      }
    }
  }

  if (pricing_rules !== undefined && pricing_rules.length > 0) {
    const nowIso = new Date().toISOString()
    const pricingPairs = Array.from(
      new Set(
        pricing_rules
          .filter((rule) => rule.provider_id && rule.api_model_id)
          .map((rule) => `${rule.provider_id}:${rule.api_model_id}`)
      )
    )

    if (pricingPairs.length > 0) {
      const { data: providerModelRows, error: providerModelsError } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, api_model_id")
        .eq("internal_model_id", modelId)

      if (providerModelsError) {
        console.error("[updateModel] Error loading provider models for pricing capabilities:", providerModelsError)
        throw new Error(providerModelsError.message)
      }

      const providerApiModelIdByPair = new Map<string, string>(
        (providerModelRows ?? []).map((row) => [
          `${row.provider_id}:${row.api_model_id}`,
          row.provider_api_model_id,
        ])
      )

      const missingProviderRows = pricingPairs
        .filter((pair) => !providerApiModelIdByPair.has(pair))
        .map((pair) => {
          const [providerId, apiModelId] = pair.split(":")
          return {
            provider_api_model_id: buildProviderApiModelId(providerId, apiModelId),
            provider_id: providerId,
            api_model_id: apiModelId,
            internal_model_id: modelId,
            is_active_gateway: false,
            created_at: nowIso,
            updated_at: nowIso,
          }
        })

      if (missingProviderRows.length > 0) {
        const { error: insertMissingProviderError } = await supabase
          .from("data_api_provider_models")
          .upsert(missingProviderRows, { onConflict: "provider_api_model_id" })

        if (insertMissingProviderError) {
          console.error("[updateModel] Error creating provider models from pricing rules:", insertMissingProviderError)
          throw new Error(insertMissingProviderError.message)
        }
      }

      const { data: providerModelRowsAfter, error: providerModelsAfterError } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, api_model_id")
        .eq("internal_model_id", modelId)

      if (providerModelsAfterError) {
        console.error("[updateModel] Error reloading provider models for pricing capabilities:", providerModelsAfterError)
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
          pricing_rules
            .filter((rule) => rule.provider_id && rule.api_model_id)
            .map((rule) => {
              const capabilityId = rule.capability_id?.trim() || "chat/completions"
              const providerApiModelId = providerApiModelIdByPairAfter.get(
                `${rule.provider_id}:${rule.api_model_id}`
              )
              return providerApiModelId ? `${providerApiModelId}:::${capabilityId}` : null
            })
            .filter((value): value is string => Boolean(value))
        )
      ).map((value) => {
        const [providerApiModelId, capabilityId] = value.split(":::")
        return {
          provider_api_model_id: providerApiModelId,
          capability_id: capabilityId,
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
    }
  }

  if (aliases !== undefined) {
    const existingSlugs = aliases.filter((a) => a.alias_slug).map((a) => a.alias_slug)
    if (existingSlugs.length > 0) {
      const { error: deleteAliasesError } = await supabase
        .from("data_api_model_aliases")
        .delete()
        .eq("api_model_id", modelId)
        .not("alias_slug", "in", `(${existingSlugs.join(",")})`)

      if (deleteAliasesError) {
        console.error("[updateModel] Error deleting old aliases:", deleteAliasesError)
        throw new Error(deleteAliasesError.message)
      }
    } else {
      const { error: deleteAliasesError } = await supabase
        .from("data_api_model_aliases")
        .delete()
        .eq("api_model_id", modelId)

      if (deleteAliasesError) {
        console.error("[updateModel] Error deleting old aliases:", deleteAliasesError)
        throw new Error(deleteAliasesError.message)
      }
    }

    if (aliases.length > 0) {
      const aliasesToInsert = aliases
        .filter((a) => a.alias_slug && a.alias_slug.trim() !== "")
        .map((alias) => ({
          alias_slug: alias.alias_slug,
          api_model_id: modelId,
          is_enabled: alias.is_enabled ?? true,
          channel: alias.channel ?? null,
          notes: alias.notes ?? null,
          updated_at: new Date().toISOString(),
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

  revalidateModelDataTags({ modelId: benchmarkRow?.model_id ?? null })
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

  revalidateModelDataTags()
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
    .select("internal_model_id")
    .eq("provider_api_model_id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("data_api_provider_models")
    .delete()
    .eq("provider_api_model_id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateModelDataTags({ modelId: providerModelRow?.internal_model_id ?? null })
  revalidatePath(`/models/**`)
  return { ok: true }
}
