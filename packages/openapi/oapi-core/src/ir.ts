export type IR = {
	version: 1;
	info: IRInfo;
	models: IRModel[];
	operations: IROperation[];
};

export type IRInfo = {
	title: string;
	version: string;
};

export type IRModel = {
	name: string;
	schema: IRSchema;
	doc?: string;
	sourcePointer?: string;
};

export type IROperation = {
	operationId: string;
	method: HttpMethod;
	path: string;
	tags: string[];
	params: IRParam[];
	requestBody?: IRRequestBody;
	responses: IRResponse[];
	doc?: string;
	sourcePointer?: string;
};

export type IRParam = {
	name: string;
	in: ParamLocation;
	required: boolean;
	schema: IRSchema;
	doc?: string;
};

export type IRRequestBody = {
	schema: IRSchema;
	contentType: string;
	kind: "json" | "form" | "text" | "binary" | "unknown";
	doc?: string;
};

export type IRResponse = {
	status: string;
	schema?: IRSchema;
	isDefault?: boolean;
	contentType?: string;
	kind?: "json" | "form" | "text" | "binary" | "unknown";
	doc?: string;
};

export type IRSchema =
	| IRPrimitiveSchema
	| IRLiteralSchema
	| IREnumSchema
	| IRArraySchema
	| IRObjectSchema
	| IRUnionSchema
	| IRIntersectionSchema
	| IRRefSchema
	| IRNullableSchema
	| IRBinarySchema
	| IRUnknownSchema;

export type IRPrimitiveSchema = {
	kind: "primitive";
	type: "string" | "number" | "boolean" | "integer";
};

export type IRLiteralSchema = {
	kind: "literal";
	value: string | number | boolean | null;
};

export type IREnumSchema = {
	kind: "enum";
	values: Array<string | number | boolean | null>;
};

export type IRArraySchema = {
	kind: "array";
	items: IRSchema;
};

export type IRObjectSchema = {
	kind: "object";
	properties: Record<string, IRSchema>;
	required: string[];
	additionalProperties?: IRSchema | boolean;
};

export type IRUnionSchema = {
	kind: "union";
	variants: IRSchema[];
};

export type IRIntersectionSchema = {
	kind: "intersection";
	parts: IRSchema[];
};

export type IRRefSchema = {
	kind: "ref";
	name: string;
};

export type IRNullableSchema = {
	kind: "nullable";
	inner: IRSchema;
};

export type IRUnknownSchema = {
	kind: "unknown";
};

export type IRBinarySchema = {
	kind: "binary";
};

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type ParamLocation = "path" | "query" | "header" | "cookie";
