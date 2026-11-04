import * as z from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const PrimitiveBindingsSchema = z.object({
	requestMapper: z.string().min(1),
	responseParser: z.string().min(1),
	streamParser: z.string().min(1).optional(),
	authSigner: z.string().min(1),
	transport: z.string().min(1),
	usageNormalizer: z.string().min(1),
	errorNormalizer: z.string().min(1),
	jobHandler: z.string().min(1).optional(),
}).strict();

export const ParameterSupportLevelSchema = z.enum([
	"native",
	"emulated",
	"ignored",
	"unsupported",
	"unknown",
]);

export const ConstraintExpressionSchema: z.ZodType<ConstraintExpression> = z.lazy(() =>
	z.union([
		z.object({ all: z.array(ConstraintExpressionSchema).min(1) }).strict(),
		z.object({ any: z.array(ConstraintExpressionSchema).min(1) }).strict(),
		z.object({ not: ConstraintExpressionSchema }).strict(),
		z.object({ path: z.string().min(1), op: z.literal("exists") }).strict(),
		z.object({ path: z.string().min(1), op: z.enum(["equals", "in"]), value: z.unknown() }).strict(),
	]),
);

export type ConstraintExpression =
	| { all: ConstraintExpression[] }
	| { any: ConstraintExpression[] }
	| { not: ConstraintExpression }
	| { path: string; op: "exists" }
	| { path: string; op: "equals" | "in"; value: unknown };

export const CompiledConstraintSchema = z.object({
	key: z.string().min(1),
	expression: ConstraintExpressionSchema,
	outcome: z.enum(["reject", "warn", "transform"]),
	message: z.string().min(1),
	priority: z.number().int(),
}).strict();

export const ExecutionPlanSchema = z.object({
	planVersion: z.literal(1),
	releaseSequence: z.number().int().positive(),
	providerModelId: z.string().min(1),
	providerId: z.string().min(1),
	capabilityId: z.string().min(1),
	routeVariantId: z.string().uuid().nullable(),
	endpoint: z.object({
		baseUrl: z.string().url(),
		pathTemplate: z.string().min(1),
		apiVersion: z.string().nullable(),
		timeoutMs: z.number().int().positive().max(900_000),
	}).strict(),
	primitives: PrimitiveBindingsSchema,
	config: JsonObjectSchema,
	parameterSupport: z.record(z.string(), z.object({
		level: ParameterSupportLevelSchema,
		config: JsonObjectSchema,
	}).strict()),
	constraints: z.array(CompiledConstraintSchema),
	evidenceCheckedAt: z.string().datetime().nullable(),
}).strict();

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export type ExecutionPlanSource = {
	releaseSequence: number;
	providerModelId: string;
	providerId: string;
	capabilityId: string;
	routeVariantId: string | null;
	endpoint: ExecutionPlan["endpoint"];
	primitives: ExecutionPlan["primitives"];
	configLayers: Array<{ precedence: number; config: Record<string, unknown> }>;
	parameterSupport: ExecutionPlan["parameterSupport"];
	constraints: ExecutionPlan["constraints"];
	evidenceCheckedAt: string | null;
};

function assertSafeConfigValue(value: unknown): void {
	if (!value || typeof value !== "object") return;
	for (const [key, nestedValue] of Object.entries(value)) {
		if (["__proto__", "prototype", "constructor"].includes(key)) {
			throw new Error(`Execution-plan config contains unsafe key: ${key}`);
		}
		assertSafeConfigValue(nestedValue);
	}
}

function mergeConfig(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (["__proto__", "prototype", "constructor"].includes(key)) {
			throw new Error(`Execution-plan config contains unsafe key: ${key}`);
		}
		assertSafeConfigValue(value);
		const previous = merged[key];
		if (
			previous && value &&
			typeof previous === "object" && !Array.isArray(previous) &&
			typeof value === "object" && !Array.isArray(value)
		) {
			merged[key] = mergeConfig(
				previous as Record<string, unknown>,
				value as Record<string, unknown>,
			);
		} else {
			merged[key] = value;
		}
	}
	return merged;
}

export function compileExecutionPlan(source: ExecutionPlanSource): ExecutionPlan {
	const precedences = source.configLayers.map((layer) => layer.precedence);
	if (new Set(precedences).size !== precedences.length) {
		throw new Error("Execution-plan config layers must have unique precedence values");
	}

	const config = source.configLayers
		.slice()
		.sort((left, right) => left.precedence - right.precedence)
		.reduce<Record<string, unknown>>(
			(accumulator, layer) => mergeConfig(accumulator, layer.config),
			{},
		);

	return ExecutionPlanSchema.parse({
		planVersion: 1,
		releaseSequence: source.releaseSequence,
		providerModelId: source.providerModelId,
		providerId: source.providerId,
		capabilityId: source.capabilityId,
		routeVariantId: source.routeVariantId,
		endpoint: source.endpoint,
		primitives: source.primitives,
		config,
		parameterSupport: source.parameterSupport,
		constraints: source.constraints
			.slice()
			.sort((left, right) => left.priority - right.priority),
		evidenceCheckedAt: source.evidenceCheckedAt,
	});
}

export function executionPlanCacheKey(plan: ExecutionPlan): string {
	return `execution-plan:${JSON.stringify([
		plan.releaseSequence,
		plan.providerModelId,
		plan.capabilityId,
		plan.routeVariantId,
	])}`;
}
