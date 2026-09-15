export interface WorkspaceAutoTopUpUpdate {
  amount_nanos?: number;
  balance_threshold_nanos?: number;
  enabled: boolean;
  mfa_bypass_acknowledged?: boolean;
  mfa_bypass_phrase?: string;
  payment_method_id?: string | null;
}
