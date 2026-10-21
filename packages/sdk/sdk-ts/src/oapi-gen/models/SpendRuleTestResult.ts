/**
 * The test alert and what happened at each destination.
 */
export interface SpendRuleTestResult {
  delivered: number;
  deliveries: {
    delivered: boolean;
    destination_id: string;
    error: string | null;
    name: string;
    status: number | null;
    type: string;
  }[];
  failed: number;
  message: string;
  rule_id: string;
  rule_name: string;
  source: "rule" | "routes";
  test: boolean;
  title: string;
}
