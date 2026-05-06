export interface ErrorRoutingDiagnostics {
  filterStages?: {
    afterCount?: number;
    beforeCount?: number;
    droppedProviders?: {
      providerId?: string | null;
      reason?: string | null;
      [key: string]: unknown;
    }[];
    stage?: string;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}
