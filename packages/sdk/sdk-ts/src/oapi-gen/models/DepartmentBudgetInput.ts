export interface DepartmentBudgetInput {
  department_id: string;
  interval: "daily" | "weekly" | "monthly";
  limit: number;
}
