import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";

// Liquid's hosted d1 models take images and (from d1.2) audio as top-level base64
// data URLs beside state and questions: https://docs.liquid.ai/lfm/models/d1.md#image-inputs
export const executor: ProviderExecutor = args => executeSystemOne(
	args, "https://api.liquid.ai/decisions/v1/systemone", "d1:free", { forwardMedia: true },
);
