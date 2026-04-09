export interface RerankResult {
  document?:
    | string
    | {
        [key: string]: unknown;
      };
  index?: number;
  relevance_score?: number;
}
