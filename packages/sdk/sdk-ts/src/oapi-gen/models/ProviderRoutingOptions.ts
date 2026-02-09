/**
 * Provider routing preferences for gateway selection.
 */
export interface ProviderRoutingOptions {
  ignore?: string[];
  include_alpha?: boolean;
  only?: string[];
  order?: string[];
}
