import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";

export const executor: ProviderExecutor = args => executeSystemOne(
	args, "https://api.liquid.ai/decisions/v1/systemone", "d1:free",
);
