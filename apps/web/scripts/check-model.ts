import { createAdminClient } from "../src/utils/supabase/admin";

const client = createAdminClient();

async function main() {
  const { data } = await client
    .from("gateway_requests")
    .select("model_id, success, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Recent gateway_requests:");
  console.log(JSON.stringify(data, null, 2));

  // Also check for the specific model
  const { data: modelData } = await client
    .from("gateway_requests")
    .select("model_id, success, created_at")
    .ilike("model_id", "%gpt-5-nano%")
    .limit(5);

  console.log("\nWith 'gpt-5-nano':");
  console.log(JSON.stringify(modelData, null, 2));
}

main().catch(console.error);
