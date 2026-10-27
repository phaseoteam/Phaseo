/**
 * Limits which requests are classified. Leave a list out to include everything.
 */
export interface ClassifierScope {
  app_ids?: string[];
  key_ids?: string[];
  models?: string[];
}
