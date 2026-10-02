import type { AccountWorkspaceContext } from "./context";

export async function usageKeyScope(context: AccountWorkspaceContext, url: URL) {
 const creatorId = url.searchParams.get("user")?.trim() || null;
 // The bounded existence read authorizes the profile lookup. Filtering uses
 // database joins, never a truncated key list or an unbounded IN URL.
 let hasCreatorKeys = false;
 if (creatorId) {
  const result = await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).eq("created_by", creatorId).limit(1);
  if (result.error) throw result.error;
  hasCreatorKeys = Boolean(result.data?.length);
 }
 const keyId = url.searchParams.get("key")?.trim() || null;
 return { creatorId, hasCreatorKeys,
  requestsTable: creatorId ? "v2_web_gateway_requests_by_creator" : "v2_web_gateway_requests",
  factsTable: creatorId ? "v2_request_facts_by_creator" : "v2_request_facts",
  apply: <T>(query: T): T => {
   let scoped = query as any;
   if (keyId) scoped = url.searchParams.get("key_op") === "is_not" ? scoped.neq("key_id", keyId) : scoped.eq("key_id", keyId);
   if (creatorId) scoped = scoped.eq("key_created_by", creatorId);
   return scoped as T;
  }
 };
}
