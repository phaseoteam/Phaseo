import type { OpenAICompatConfig } from "../openai-compatible/types";

export const WEIGHTSANDBIASES_API_KEY_ENVS = ["WEIGHTSANDBIASES_API_KEY", "WANDB_API_KEY"] as const;

export const WEIGHTS_AND_BIASES_OPENAI_COMPAT_CONFIGS = {
	"weights-and-biases": {
		providerId: "weights-and-biases",
		baseUrl: "https://api.inference.wandb.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "WEIGHTSANDBIASES_API_KEY",
		baseUrlEnv: "WANDB_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
