import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { requireAuthenticatedUser } from "@/utils/serverActionAuth";

type UsageRevalidationScope = "all" | "dashboard" | "logs";

// Checks the session; serverMutation then reloads the usage data in the browser.
// The scope is kept for callers; every scope refreshes the whole page.
export const revalidateUsage = createServerFn({ method: "POST" })
  .middleware([serverMutation])
  .validator((scope: UsageRevalidationScope = "all") => scope)
  .handler(async () => {
    try {
      await requireAuthenticatedUser();
      return { ok: true } as const;
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e) } as const;
    }
  });
