import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@phaseo/oapi-core";
import { splitPathTemplate } from "@phaseo/oapi-core";

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
		"module Phaseo",
		"  module Gen",
		"    class RequestError < StandardError",
		"      attr_reader :status_code, :response_body, :headers, :payload",
		"",
		"      def initialize(status_code:, response_body:, status_message: nil, message: nil, headers: {})",
		"        super(message || build_message(status_code, response_body, status_message))",
		"        @status_code = status_code",
		"        @response_body = response_body",
		"        @headers = (headers || {}).transform_keys(&:downcase)",
		"        @payload = begin",
		"          parsed = JSON.parse(response_body.to_s)",
		"          parsed.is_a?(Hash) ? parsed : {}",
		"        rescue JSON::ParserError",
		"          {}",
		"        end",
		"      end",
		"",
		"      def request_id; value = @payload[\"request_id\"] || @headers[\"x-request-id\"]; value.to_s.strip.empty? ? nil : value.to_s; end",
		"      def generation_id = @payload[\"generation_id\"]",
		"      def code; value = @payload[\"code\"] || @payload[\"error\"]; value.is_a?(String) ? value : nil; end",
		"      def error_type = @payload[\"error_type\"]",
		"      def error_origin = @payload[\"error_origin\"]",
		"      def action = @payload[\"action\"]",
		"      def docs_url = @payload[\"docs_url\"]",
		"      def support_url = @payload[\"support_url\"]",
		"      def details = @payload[\"details\"]",
		"      def retryable",
		"        @payload[\"retryable\"] if @payload.key?(\"retryable\")",
		"      end",
		"      def retry_after_seconds; value = @payload[\"retry_after_seconds\"] || @headers[\"retry-after\"]; value.to_i if value.to_s.match?(/\\A\\d+\\z/); end",
		"",
		"      private",
		"",
		"      def build_message(status_code, response_body, status_message)",
		"        trimmed = response_body.to_s.strip",
		"        prefix = status_message.to_s.strip.empty? ? \"Request failed: #{status_code}\" : \"Request failed: #{status_code} #{status_message}\"",
		"        return prefix if trimmed.empty?",
		"",
		"        \"#{prefix} #{trimmed}\"",
		"      end",
		"    end",
		"",
		"    class Client",
		"      def initialize(base_url:, headers: {})",
		"        @base_url = base_url.chomp(\"/\")",
		"        @headers = headers",
		"      end",
		"",
		"      def build_request(method:, path:, query: nil, headers: nil, body: nil)",
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
		"        [http, req]",
		"      end",
		"",
		"      def request(method:, path:, query: nil, headers: nil, body: nil)",
		"        http, req = build_request(method:, path:, query:, headers:, body:)",
		"        response = http.request(req)",
		"        unless response.is_a?(Net::HTTPSuccess)",
		"          raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s, headers: response.each_header.to_h)",
		"        end",
		"        return nil if response.body.nil? || response.body.empty?",
		"        JSON.parse(response.body)",
		"      end",
		"",
		"      def request_bytes(method:, path:, query: nil, headers: nil, body: nil)",
		"        http, req = build_request(method:, path:, query:, headers:, body:)",
		"        response = http.request(req)",
		"        unless response.is_a?(Net::HTTPSuccess)",
		"          raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s, headers: response.each_header.to_h)",
		"        end",
		"        response.body.to_s.b",
		"      end",
		"",
		"      def request_stream(method:, path:, query: nil, headers: nil, body: nil)",
		"        return enum_for(__method__, method:, path:, query:, headers:, body:) unless block_given?",
		"        http, req = build_request(method:, path:, query:, headers: (headers || {}).merge(\"Accept\" => \"text/event-stream\"), body:)",
		"        http.request(req) do |response|",
		"          unless response.is_a?(Net::HTTPSuccess)",
		"            raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s, headers: response.each_header.to_h)",
		"          end",
		"          buffer = String.new",
		"          response.read_body do |chunk|",
		"            buffer << chunk",
		"            while (index = buffer.index(\"\\n\"))",
		"              yield buffer.slice!(0, index + 1).sub(/\\r?\\n\\z/, \"\")",
		"            end",
		"          end",
		"          yield buffer unless buffer.empty?",
		"        end",
		"      end",
		"    end",
		"  end",
		"end",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = ["module Phaseo", "  module Gen"];
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
	const lines: string[] = ["require_relative \"client\"", "", "module Phaseo", "  module Gen", "    module Operations"];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
	}
	lines.push("    end", "  end", "end", "");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	const successResponse = operation.responses.find((response) => {
		const status = Number(response.status);
		return !Number.isNaN(status) && status >= 200 && status < 300;
	});
	return [
		`      def self.${operation.operationId}(client, path: nil, query: nil, headers: nil, body: nil)`,
		"        path ||= {}",
		`        resolved_path = ${pathTemplate}`,
		`        client.${successResponse?.kind === "text" ? "request_bytes" : "request"}(method: "${operation.method.toUpperCase()}", path: resolved_path, query: query, headers: headers, body: body)`,
		"      end",
		""
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `"${escapeRubyDoubleQuoted(path)}"`;
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return `#{URI.encode_uri_component(path["${name}"].to_s)}`;
		}
		return escapeRubyDoubleQuoted(segment);
	});
	return `"${parts.join("")}"`;
}

function escapeRubyDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/#/g, "\\#").replace(/"/g, '\\"');
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
