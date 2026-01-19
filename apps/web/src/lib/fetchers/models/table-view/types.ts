// Types for monitor models functionality

export interface MonitorModelData {
    id: string; // Will be model_id + provider_id + key
    model: string;
    modelId: string; // Add model ID for logo lookup
    organisationId?: string; // Add organisation ID for logo lookup
    provider: {
        name: string;
        id: string; // Add provider ID for logo lookup
        inputPrice: number;
        outputPrice: number;
        features: string[];
    };
    endpoint: string; // The specific endpoint/key
    gatewayStatus: "active" | "inactive"; // Whether this endpoint is active on the gateway
    inputModalities: string[];
    outputModalities: string[];
    context: number;
    maxOutput: number;
    quantization?: string;
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
    input_modalities?: unknown;
    output_modalities?: unknown;
    params?: unknown;
    provider?: GatewayProvider;
};