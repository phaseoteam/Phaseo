/**
 * Structured constraints and provider support for request parameters, keyed by parameter name.
 */
export interface SupportedParameterDetails {
  [key: string]: {
    [key: string]: unknown;
  };
}
