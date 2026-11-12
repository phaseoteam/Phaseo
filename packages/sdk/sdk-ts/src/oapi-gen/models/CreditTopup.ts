export interface CreditTopup {
  amount_cents: number;
  amount_usd: number;
  checkout_url: string | null;
  confirmation_recipients?: number;
  created_at: string;
  currency: string;
  decided_at: string | null;
  expires_at: string;
  final: boolean;
  flow: "checkout" | "saved_card";
  id: string;
  message: string;
  next_action:
    | "open_checkout_url"
    | "await_email_confirmation"
    | "await_payment"
    | null
    | null;
  paid_at: string | null;
  payment_method: {
    brand?: string | null;
    last4?: string | null;
  } | null;
  reason: string | null;
  status: "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
  workspace_id: string;
}
