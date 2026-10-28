export interface ClassifierTestRequest {
  classifier?: {
    dimensions?: {
      allow_other?: boolean;
      description?: string | null;
      key: string;
      multiple?: boolean;
      name?: string;
      values: {
        description?: string | null;
        value: string;
      }[];
    }[];
    instructions?: string;
    model?: string;
  };
  classifier_id?: string;
  sample: {
    prompt: string;
    response?: string;
  };
}
