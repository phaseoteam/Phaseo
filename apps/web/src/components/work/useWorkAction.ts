"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { WorkActionError } from "@/app/(dashboard)/work/actions";

type ActionResult = { ok: true } | WorkActionError;

/** The message for a failed work action, in the reader's language where we know the code. */
export function useWorkErrorMessage() {
	const t = useTranslations("Work.common");
	return useCallback((error: WorkActionError) => {
		if (error.code === "github_token_missing") return t("githubTokenMissing");
		if (error.code === "triage_required") return t("triageRequired");
		if (error.status === 403) return t("forbidden");
		if (error.status === 400 && !error.message && !error.code) return t("selectWorkspace");
		return error.message ?? t("actionFailed");
	}, [t]);
}

/**
 * Runs a server action, shows its error as a toast and refreshes the page's
 * server data when it succeeds. Returns the result so callers can use it.
 */
export function useWorkAction() {
	const router = useRouter();
	const errorMessage = useWorkErrorMessage();
	const [pending, startTransition] = useTransition();
	const [busy, setBusy] = useState<string | null>(null);

	const perform = useCallback(async <T extends ActionResult>(key: string, action: () => Promise<T>, options: { refresh?: boolean } = {}): Promise<T> => {
		setBusy(key);
		try {
			const result = await action();
			if (!result.ok) toast.error(errorMessage(result as WorkActionError));
			else if (options.refresh !== false) startTransition(() => router.refresh());
			return result;
		} catch {
			const failure: WorkActionError = { ok: false, status: null, code: null, message: null };
			toast.error(errorMessage(failure));
			return failure as T;
		} finally {
			setBusy(null);
		}
	}, [errorMessage, router]);

	return { perform, busy, refreshing: pending };
}
