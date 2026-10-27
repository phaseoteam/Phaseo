/**
 * Fills in the prompt template saved on a preset. Leave out model or set it to the same reference, and send an empty conversation or the turns to add after the template.
 */
export interface PromptTemplateReference {
  id: string;
  variables?: {
    [key: string]: unknown;
  };
  version?: string;
}
