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
		"require \"time\"",
		"require \"uri\"",
		"",
		"module Phaseo",
		"  module Gen",
		"    class Response",
		"      attr_reader :status_code, :headers, :body, :request_id, :trace_url",
		"",
		"      def initialize(status_code:, headers:, body:)",
		"        @status_code = status_code",
		"        @headers = headers",
		"        @body = body",
		"        @request_id = headers[\"x-request-id\"] || headers[\"request-id\"]",
		"        @trace_url = @request_id.nil? ? nil : \"https://phaseo.app/settings/usage/logs/requests/#{URI.encode_www_form_component(@request_id).gsub(\"+\", \"%20\")}\"",
		"      end",
		"    end",
		"",
		"    class RequestError < StandardError",
		"      attr_reader :status_code, :response_body, :headers, :payload, :code, :request_id, :generation_id, :trace_url, :error_type, :error_origin, :retryable, :action, :docs_url, :support_url, :retry_after, :retry_after_seconds, :details",
		"",
		"      def initialize(status_code:, response_body:, headers: {}, status_message: nil, message: nil)",
		"        super(message || build_message(status_code, response_body, status_message))",
		"        @status_code = status_code",
		"        @response_body = response_body",
		"        @headers = headers",
		"        @payload = parse_payload(response_body)",
		"        @request_id = @payload[\"request_id\"] || headers[\"x-request-id\"] || headers[\"request-id\"]",
		"        @generation_id = @payload[\"generation_id\"] || @request_id",
		"        @error_type = @payload[\"error_type\"]",
		"        @error_origin = @payload[\"error_origin\"]",
		"        @retryable = @payload[\"retryable\"] if @payload.key?(\"retryable\")",
		"        @action = @payload[\"action\"]",
		"        @docs_url = @payload[\"docs_url\"]",
		"        @support_url = @payload[\"support_url\"]",
		"        @trace_url = @request_id.nil? ? nil : \"https://phaseo.app/settings/usage/logs/requests/#{URI.encode_www_form_component(@request_id).gsub(\"+\", \"%20\")}\"",
		"        @retry_after = headers[\"retry-after\"]",
		"        @retry_after_seconds = @payload[\"retry_after_seconds\"] || (@retry_after.to_f if @retry_after.to_s.match?(/\\A\\d+(?:\\.\\d+)?\\z/))",
		"        @details = @payload[\"details\"]",
		"        @code = parse_code(response_body)",
		"      end",
		"",
		"      private",
		"",
		"      def parse_code(response_body)",
		"        parsed = parse_payload(response_body)",
		"        error = parsed[\"error\"]",
		"        value = parsed[\"code\"] || (error.is_a?(Hash) ? error[\"code\"] : error)",
		"        value.to_s unless value.nil?",
		"      rescue JSON::ParserError, TypeError",
		"        nil",
		"      end",
		"",
		"      def parse_payload(response_body)",
		"        parsed = JSON.parse(response_body.to_s)",
		"        parsed.is_a?(Hash) ? parsed : {}",
		"      rescue JSON::ParserError, TypeError",
		"        {}",
		"      end",
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
		"      attr_accessor :timeout, :max_retries, :on_request, :on_response, :on_retry",
		"",
		"      def initialize(base_url:, headers: {}, timeout: 60, max_retries: 0, on_request: nil, on_response: nil, on_retry: nil)",
		"        @base_url = base_url.chomp(\"/\")",
		"        @headers = headers",
		"        @timeout = timeout",
		"        @max_retries = max_retries",
		"        @on_request = on_request",
		"        @on_response = on_response",
		"        @on_retry = on_retry",
		"      end",
		"",
		"      def build_request(method:, path:, query: nil, headers: nil, body: nil, options: nil)",
		"        options ||= {}",
		"        uri = URI.join(@base_url + \"/\", path.sub(%r{^/}, \"\"))",
		"        uri.query = URI.encode_www_form(query) if query && !query.empty?",
		"        http = Net::HTTP.new(uri.host, uri.port)",
		"        http.use_ssl = uri.scheme == \"https\"",
		"        timeout = options.fetch(:timeout, @timeout)",
		"        http.open_timeout = timeout if timeout",
		"        http.read_timeout = timeout if timeout",
		"        request_class = Net::HTTP.const_get(method.capitalize)",
		"        req = request_class.new(uri)",
		"        merged_headers = (@headers || {}).merge(headers || {}).merge(options.fetch(:headers, {}))",
		"        idempotency_key = options[:idempotency_key]",
		"        merged_headers[\"Idempotency-Key\"] = idempotency_key if idempotency_key",
		"        merged_headers.each { |k, v| req[k] = v }",
		"        if body",
		"          req[\"Content-Type\"] = \"application/json\"",
		"          req.body = JSON.dump(body)",
		"        end",
		"        [http, req]",
		"      end",
		"",
		"      def request(method:, path:, query: nil, headers: nil, body: nil)",
		"        request_with_response(method:, path:, query:, headers:, body:).body",
		"      end",
		"",
		"      def request_with_response(method:, path:, query: nil, headers: nil, body: nil, options: nil)",
		"        options ||= {}",
		"        normalized_method = method.to_s.upcase",
		"        retries = options.fetch(:max_retries, @max_retries).to_i",
		"        raise ArgumentError, \"max_retries must be non-negative\" if retries.negative?",
		"        retries = 0 unless [\"GET\", \"HEAD\"].include?(normalized_method)",
		"        attempt = 0",
		"        loop do",
		"          http, req = build_request(method: normalized_method, path:, query:, headers:, body:, options:)",
		"          @on_request&.call(method: normalized_method, path: path, attempt: attempt)",
		"          begin",
		"            response = http.request(req)",
		"          rescue Net::OpenTimeout, Net::ReadTimeout, EOFError, IOError, SystemCallError, SocketError => error",
		"            raise if attempt >= retries",
		"            delay = retry_delay(nil, attempt)",
		"            @on_retry&.call(method: normalized_method, path: path, attempt: attempt + 1, error: error, delay: delay)",
		"            sleep(delay) if delay.positive?",
		"            attempt += 1",
		"            next",
		"          end",
		"          response_headers = response.each_header.to_h",
		"          status_code = response.code.to_i",
		"          if retryable_status?(status_code) && attempt < retries",
		"            delay = retry_delay(response_headers[\"retry-after\"], attempt)",
		"            @on_retry&.call(method: normalized_method, path: path, attempt: attempt + 1, status_code: status_code, delay: delay)",
		"            sleep(delay) if delay.positive?",
		"            attempt += 1",
		"            next",
		"          end",
		"          @on_response&.call(method: normalized_method, path: path, attempt: attempt, status_code: status_code, headers: response_headers)",
		"          unless response.is_a?(Net::HTTPSuccess)",
		"            raise RequestError.new(status_code: status_code, response_body: response.body.to_s, headers: response_headers, status_message: response.message)",
		"          end",
		"          parsed_body = response.body.nil? || response.body.empty? ? nil : JSON.parse(response.body)",
		"          return Response.new(status_code: status_code, headers: response_headers, body: parsed_body)",
		"        end",
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
		"",
		"      private",
		"",
		"      def retryable_status?(status_code)",
		"        [408, 429, 500, 502, 503, 504].include?(status_code)",
		"      end",
		"",
		"      def retry_delay(retry_after, attempt)",
		"        return [retry_after.to_f, 60.0].min if retry_after && retry_after.match?(/\\A\\d+(?:\\.\\d+)?\\z/)",
		"        if retry_after",
		"          parsed = Time.httpdate(retry_after) rescue nil",
		"          return [[parsed - Time.now, 0].max, 60.0].min if parsed",
		"        end",
		"        [0.25 * (2**attempt), 8.0].min",
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
