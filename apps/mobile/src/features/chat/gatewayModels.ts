// The website's provider naming and logo rules are plain functions; sharing them keeps provider names
// and logos in chat identical to phaseo.app (as Logo.tsx does with the logo manifest).
import { inferProviderFamilyIdFromSiblings, resolveProviderDisplayName, resolveProviderLogoId, type ProviderOfferScope } from "../../../../web/src/lib/providers/providerOffers";
import { routeReasoningSupport, routeServiceTierSupport, type RouteCapabilities } from "./capabilities";

/** One provider route of a chat model, reduced to what chat needs (the raw feed is ~1.5 MB). */
export type ChatRoute = RouteCapabilities & {
  providerName: string;
  logoId: string;
  inputPrice: number | null;
  outputPrice: number | null;
};

/** A model the web chat can run, from `/api/_web/gateway/models?available_only=true`, grouped by selector ID. */
export type GatewayChatModel = {
  modelId: string;
  label: string | null;
  orgId: string | null;
  orgName: string | null;
  releaseDate: string | null;
  inputModalities: string[];
  routes: ChatRoute[];
};

type RawRoute = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/** Text-generation routes, grouped by the model ID chat sends (selectorModelId), with each route's limits worked out once. */
export function compactGatewayModels(rows: unknown): GatewayChatModel[] {
  if (!Array.isArray(rows)) return [];
  const routes = rows.filter((row): row is RawRoute => Boolean(row) && typeof row === "object" && strings((row as RawRoute).capabilities).includes("text.generate") && (row as RawRoute).isAvailable !== false && !(row as RawRoute).isInternal);
  const knownProviderIds = new Set(routes.map((row) => text(row.providerId)).filter((id): id is string => Boolean(id)));
  const models = new Map<string, GatewayChatModel>();
  for (const row of routes) {
    const modelId = text(row.selectorModelId) ?? text(row.modelId);
    const providerId = text(row.providerId);
    if (!modelId || !providerId) continue;
    let model = models.get(modelId);
    if (!model) {
      model = { modelId, label: text(row.modelName), orgId: text(row.organisationId), orgName: text(row.organisationName), releaseDate: text(row.releaseDate) ?? text(row.announcementDate), inputModalities: strings(row.inputModalities), routes: [] };
      models.set(modelId, model);
    }
    model.label ??= text(row.modelName);
    model.orgId ??= text(row.organisationId);
    model.orgName ??= text(row.organisationName);
    model.releaseDate ??= text(row.releaseDate) ?? text(row.announcementDate);
    for (const modality of strings(row.inputModalities)) if (!model.inputModalities.includes(modality)) model.inputModalities.push(modality);
    if (model.routes.some((route) => route.providerId === providerId)) continue;
    const familyId = text(row.providerFamilyId) ?? inferProviderFamilyIdFromSiblings({ providerId, knownProviderIds });
    model.routes.push({
      providerId,
      providerName: resolveProviderDisplayName({ providerId, providerName: text(row.providerName) ?? providerId, offerLabel: text(row.providerOfferLabel), offerScope: text(row.providerOfferScope) as ProviderOfferScope | null }),
      logoId: resolveProviderLogoId({ providerId, providerFamilyId: familyId }),
      reasoning: routeReasoningSupport(row.capabilityParamsById),
      serviceTiers: routeServiceTierSupport({ serviceTiers: row.serviceTiers, capabilityParamsById: row.capabilityParamsById, capabilities: strings(row.capabilities) }),
      inputPrice: num(row.inputPricePerMillion),
      outputPrice: num(row.outputPricePerMillion),
    });
  }
  for (const model of models.values()) model.routes.sort((a, b) => a.providerName.localeCompare(b.providerName));
  return [...models.values()];
}
