import { z } from "zod";

export type ModelPageNoticeTone = "info" | "warning" | "critical";

export type ModelPageNotice = {
	apiModelId: string;
	tone: ModelPageNoticeTone;
	markdown: string;
};

const modelPageNoticeSchema = z.object({
	apiModelId: z.string().min(1),
	tone: z.enum(["info", "warning", "critical"]),
	markdown: z.string().min(1),
});

function normalizeId(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeMarkdown(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

export function parseModelPageNoticeRow(row: {
	api_model_id?: unknown;
	tone?: unknown;
	markdown?: unknown;
} | null | undefined): ModelPageNotice | null {
	const parsed = modelPageNoticeSchema.safeParse({
		apiModelId: normalizeId(row?.api_model_id),
		tone: normalizeId(row?.tone),
		markdown: normalizeMarkdown(row?.markdown),
	});

	if (!parsed.success) {
		return null;
	}

	return parsed.data;
}
