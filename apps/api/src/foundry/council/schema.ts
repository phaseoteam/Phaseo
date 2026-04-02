import { z } from "zod";

export const CouncilReasoningEffortSchema = z.enum([
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export const CouncilRunConfigSchema = z.object({
	source_models: z.array(z.string().min(1)).min(2).max(4),
	analyser_model: z.string().min(1),
	fuser_model: z.string().min(1),
	grounding: z.boolean().optional().default(false),
	reasoning_effort: CouncilReasoningEffortSchema.optional().default("medium"),
	temperature: z.number().min(0).max(2).optional().default(0.2),
	max_budget_usd: z.number().positive().optional().default(0.75),
	max_source_output_tokens: z.number().int().positive().optional().default(1800),
	max_fuser_output_tokens: z.number().int().positive().optional().default(2500),
});

export const CouncilRunCreateSchema = z.object({
	conversation_id: z.string().min(1).optional(),
	prompt: z.string().min(1),
	config: CouncilRunConfigSchema,
});

export const CouncilAgreementItemSchema = z.object({
	point: z.string(),
	supporting_models: z.array(z.string()),
	confidence: z.enum(["low", "medium", "high"]),
});

export const CouncilKeyDifferenceItemSchema = z.object({
	topic: z.string(),
	stances: z.array(
		z.object({
			model: z.string(),
			stance: z.string(),
		}),
	),
	material: z.boolean(),
});

export const CouncilPartialCoverageItemSchema = z.object({
	models: z.array(z.string()),
	point: z.string(),
});

export const CouncilUniqueInsightItemSchema = z.object({
	model: z.string(),
	insight: z.string(),
});

export const CouncilAnalysisSchema = z.object({
	agreement: z.array(CouncilAgreementItemSchema),
	key_differences: z.array(CouncilKeyDifferenceItemSchema),
	partial_coverage: z.array(CouncilPartialCoverageItemSchema),
	unique_insights: z.array(CouncilUniqueInsightItemSchema),
	blind_spots: z.array(z.string()),
});

export const COUNCIL_ANALYSIS_JSON_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: [
		"agreement",
		"key_differences",
		"partial_coverage",
		"unique_insights",
		"blind_spots",
	],
	properties: {
		agreement: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["point", "supporting_models", "confidence"],
				properties: {
					point: { type: "string" },
					supporting_models: {
						type: "array",
						items: { type: "string" },
					},
					confidence: {
						type: "string",
						enum: ["low", "medium", "high"],
					},
				},
			},
		},
		key_differences: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["topic", "stances", "material"],
				properties: {
					topic: { type: "string" },
					stances: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: ["model", "stance"],
							properties: {
								model: { type: "string" },
								stance: { type: "string" },
							},
						},
					},
					material: { type: "boolean" },
				},
			},
		},
		partial_coverage: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["models", "point"],
				properties: {
					models: {
						type: "array",
						items: { type: "string" },
					},
					point: { type: "string" },
				},
			},
		},
		unique_insights: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["model", "insight"],
				properties: {
					model: { type: "string" },
					insight: { type: "string" },
				},
			},
		},
		blind_spots: {
			type: "array",
			items: { type: "string" },
		},
	},
} as const;

