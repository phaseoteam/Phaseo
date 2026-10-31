import { createServerFn } from "@tanstack/react-start";
import { serverAction } from "@/lib/serverFn/actionMiddleware";
import { fetchFrontendPricingModels } from "@/lib/fetchers/frontend/fetchFrontendPricingModels";

export const loadPricingCalculatorModels = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((modelIds: string[]) => modelIds)
	.handler(async ({ data: modelIds }) => {
		const ids = [...new Set(
			modelIds.map((value) => value.trim()).filter(Boolean),
		)].slice(0, 100);
		if (ids.length === 0) return [];
		return fetchFrontendPricingModels(ids);
	});
