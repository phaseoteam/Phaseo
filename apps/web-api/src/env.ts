export type Env = {
  ENV: "development" | "preview" | "staging" | "production";
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
	REVALIDATION_SECRET?: string;
  STATUS_PAGE_SUMMARY_URL?: string;
  STATUS_PAGE_COMPONENTS_URL?: string;
};
