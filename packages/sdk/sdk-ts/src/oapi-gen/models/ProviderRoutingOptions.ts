/**
 * Provider routing preferences for gateway selection. Global routing policy is configured in the dashboard and applied before request-level overrides.
 */
export interface ProviderRoutingOptions {
  ignore?: string[];
  only?: string[];
  order?: string[];
}
