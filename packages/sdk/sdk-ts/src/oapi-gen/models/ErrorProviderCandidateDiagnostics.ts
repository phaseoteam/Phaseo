export interface ErrorProviderCandidateDiagnostics {
  candidateCount?: number;
  droppedMissingAdapter?: {
    endpoint?: string | null;
    providerId?: string | null;
    [key: string]: unknown;
  }[];
  droppedUnsupportedEndpoint?: string[];
  supportsEndpointCount?: number;
  totalProviders?: number;
  [key: string]: unknown;
}
