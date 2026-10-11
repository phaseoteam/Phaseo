export interface OpenAIModelsResponse {
  data: {
    created: number;
    id: string;
    object: "model";
    owned_by: string;
  }[];
  object: "list";
}
