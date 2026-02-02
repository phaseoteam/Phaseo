"use server";

import { revalidatePath } from "next/cache";

export async function revalidateUsage() {
  try {
	revalidatePath("/gateway/usage");
    revalidatePath("/gateway/usage");
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) } as const;
  }
}
