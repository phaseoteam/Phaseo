/**
 * A department's spend budget. A department's spend is what the API keys linked to it cost, plus the keys its members created and their OAuth requests when those keys are not linked to a department. A member in several departments counts toward each.
 */
export interface DepartmentBudget {
  created_at: string;
  created_by?: string | null;
  department_id: string;
  department_name: string | null;
  exceeded: boolean;
  id: string;
  interval: "daily" | "weekly" | "monthly";
  limit: number;
  limit_nanos: number;
  remaining: number;
  remaining_nanos: number;
  reset_at?: string | null;
  updated_at: string;
  usage: number;
  usage_nanos: number;
  window_start?: string | null;
  workspace_id: string;
}
