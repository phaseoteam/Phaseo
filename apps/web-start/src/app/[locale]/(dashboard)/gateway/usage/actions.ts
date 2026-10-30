"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/utils/serverActionAuth";

type UsageRevalidationScope = "all" | "dashboard" | "logs";

export async function revalidateUsage(scope: UsageRevalidationScope = "all") {
  try {
        await requireAuthenticatedUser();
        if (scope === "all" || scope === "dashboard") {
                revalidatePath("/gateway/usage");
                revalidatePath("/settings/usage");
        }
        if (scope === "all" || scope === "logs") {
                revalidatePath("/settings/usage/logs");
        }
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) } as const;
  }
}
