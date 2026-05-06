export interface ModelAvailability {
  active_provider_count: number;
  inactive_provider_count: number;
  provider_count: number;
  status: "active" | "coming_soon" | "inactive" | "not_listed";
}
