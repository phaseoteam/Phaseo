// Types for monitor models functionality

export interface MonitorModelData {
    id: string; // Canonical API model id + provider + capability key
    model: string;
    modelId: string; // Canonical model_id (API model id semantics)
    apiModelId?: string;
    organisationId?: string; // Add organisation ID for logo lookup
    provider: {
        name: string;
        id: string; // Add provider ID for logo lookup
        inputPrice: number;
        outputPrice: number;
        fromPrice?: number | null;
        fromPriceUnit?: string | null;
        features: string[];
    };
    endpoint: string; // The specific endpoint/key
    gatewayStatus: string; // Capability/gateway status (active, inactive, deranked_lvl1, deranked_lvl2, deranked_lvl3, disabled, ...)
    inputModalities: string[];
    outputModalities: string[];
    context: number;
    maxOutput: number;
    quantization?: string;
    supportedParameters?: string[];
    effectiveFrom?: string;
    tier?: string; // pricing tier
    added?: string;
    retired?: string; // When this model is retired
}

export interface MonitorModelFilters {
    search?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    features?: string[];
    endpoints?: string[];
    statuses?: Array<MonitorModelData["gatewayStatus"]>;
    tiers?: string[];
    year?: number;
    sortField?: string;
    sortDirection?: "asc" | "desc";
}

export type GatewayProvider =
    | {
        api_provider_name?: string | null;
        link?: string | null;
    }
    | null;

export type GatewayModel = {
    model_id: string;
    api_model_id?: string | null;
    api_provider_id: string;
    key: string;
    endpoint?: string | null;
    is_active_gateway?: boolean | null;
    capability_status?: string | null;
    input_modalities?: unknown;
    output_modalities?: unknown;
    params?: unknown;
    provider?: GatewayProvider;
};
