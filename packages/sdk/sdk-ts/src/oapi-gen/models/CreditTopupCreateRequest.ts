export interface CreditTopupCreateRequest {
  amount_usd: number;
  idempotency_key?: string;
  workspace_id?: string;
}
