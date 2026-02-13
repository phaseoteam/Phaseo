"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/utils/serverActionAuth";

export async function revalidateUsage() {
  try {
	await requireAuthenticatedUser();
	revalidatePath("/gateway/usage");
	revalidatePath("/settings/usage");
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) } as const;
  }
}
