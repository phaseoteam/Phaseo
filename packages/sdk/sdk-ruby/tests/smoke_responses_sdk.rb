require "json"
require_relative "../lib/index"

api_key = ENV["PHASEO_API_KEY"]
raise "PHASEO_API_KEY is required" if api_key.nil? || api_key.empty?

base_url = ENV["PHASEO_BASE_URL"] || "https://api.phaseo.ai/v1"
model = ENV["PHASEO_SMOKE_MODEL"] || "openai/gpt-5.4-nano"
input = ENV["PHASEO_SMOKE_INPUT"] || "Hi"
max_output_tokens = (ENV["PHASEO_SMOKE_MAX_OUTPUT_TOKENS"] || "32").to_i
max_output_tokens = 32 if max_output_tokens <= 0

client = PhaseoSdk::Phaseo.new(
  api_key: api_key,
  base_path: base_url,
  enable_deprecation_warnings: false,
  devtools: PhaseoSdk::Devtools.create
)

response = client.create_response(
  model: model,
  input: input,
  max_output_tokens: max_output_tokens
)

unless response.is_a?(Hash) && !response["id"].to_s.empty?
  raise "Expected response hash with id, got #{response.class}"
end

puts JSON.pretty_generate(response)
