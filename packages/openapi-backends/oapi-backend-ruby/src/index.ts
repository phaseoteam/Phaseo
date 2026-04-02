import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendRuby: Backend = {
	id: "ruby",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "client.rb", contents: renderClient() });
		files.push({ path: "models.rb", contents: renderModels(ir.models) });
		files.push({ path: "operations.rb", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendRuby;

function renderClient(): string {
	return [
		"require \"json\"",
		"require \"net/http\"",
		"require \"uri\"",
		"",
		"module AiStats",
		"  module Gen",
		"    class Client",
		"      def initialize(base_url:, headers: {})",
		"        @base_url = base_url.chomp(\"/\")",
		"        @headers = headers",
		"      end",
		"",
		"      def request(method:, path:, query: nil, headers: nil, body: nil)",
		"        uri = URI.join(@base_url + \"/\", path.sub(%r{^/}, \"\"))",
		"        uri.query = URI.encode_www_form(query) if query && !query.empty?",
		"        http = Net::HTTP.new(uri.host, uri.port)",
		"        http.use_ssl = uri.scheme == \"https\"",
		"        request_class = Net::HTTP.const_get(method.capitalize)",
		"        req = request_class.new(uri)",
		"        (@headers || {}).merge(headers || {}).each { |k, v| req[k] = v }",
		"        if body",
		"          req[\"Content-Type\"] = \"application/json\"",
		"          req.body = JSON.dump(body)",
		"        end",
		"        response = http.request(req)",
		"        unless response.is_a?(Net::HTTPSuccess)",
		"          raise \"Request failed: #{response.code} #{response.message}\"",
		"        end",
		"        return nil if response.body.nil? || response.body.empty?",
		"        JSON.parse(response.body)",
		"      end",
		"    end",
		"  end",
		"end",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = ["module AiStats", "  module Gen"];
	for (const model of models) {
		lines.push(renderModel(model));
	}
	lines.push("  end", "end", "");
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		if (fields.length === 0) {
			return `    ${model.name} = Struct.new(:_unused, keyword_init: true)`;
		}
		const docs: string[] = [];
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			docs.push(`    # @!attribute [rw] ${name}`);
			docs.push(`    #   @return [${rubyYardType(model.schema.properties[field], required.has(field))}]`);
		}
		const fieldList = fields.map((field) => `:${sanitizeIdentifier(field)}`).join(", ");
		return `${docs.join("\n")}\n    ${model.name} = Struct.new(${fieldList}, keyword_init: true)`;
	}
	return `    ${model.name} = Object`;
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = ["require_relative \"client\"", "", "module AiStats", "  module Gen", "    module Operations"];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
	}
	lines.push("    end", "  end", "end", "");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`      def self.${operation.operationId}(client, path: nil, query: nil, headers: nil, body: nil)`,
		"        path ||= {}",
		`        resolved_path = ${pathTemplate}`,
		`        client.request(method: "${operation.method.toUpperCase()}", path: resolved_path, query: query, headers: headers, body: body)`,
		"      end",
		""
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `"${path}"`;
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return `#{path["${name}"]}`;
		}
		return segment.replace(/"/g, '\\"');
	});
	return `"${parts.join("")}"`;
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function rubyYardType(schema: IRSchema, required: boolean): string {
	let type = rubyYardBaseType(schema);
	if (!required && !hasNilType(type)) {
		type = `${type}, nil`;
	}
	return type;
}

function rubyYardBaseType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "Boolean";
			if (schema.type === "integer") return "Integer";
			if (schema.type === "number") return "Float";
			return "String";
		case "literal":
			return "Object";
		case "enum":
			return "String";
		case "array":
			return `Array<${rubyYardBaseType(schema.items)}>`;
		case "object":
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
			return "Hash{String => Object}";
		case "union": {
			const variants = Array.from(new Set(schema.variants.map((variant) => rubyYardBaseType(variant))));
			return variants.length ? variants.join(", ") : "Object";
		}
		case "intersection":
		case "unknown":
			return "Object";
		case "ref":
			return schema.name;
		case "nullable": {
			const inner = rubyYardBaseType(schema.inner);
			return hasNilType(inner) ? inner : `${inner}, nil`;
		}
		default:
			return "Object";
	}
}

function hasNilType(type: string): boolean {
	return type.split(",").map((part) => part.trim()).includes("nil");
}

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
}

function _unusedType(_schema: IRSchema): string {
	return "Object";
}
