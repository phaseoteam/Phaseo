export interface ErrorProviderEnablementDiagnostics {
  capability?: string;
  dropped?: {
    providerId?: string | null;
    reason?: string | null;
    [key: string]: unknown;
  }[];
  providersAfter?: string[];
  providersBefore?: string[];
  [key: string]: unknown;
}
