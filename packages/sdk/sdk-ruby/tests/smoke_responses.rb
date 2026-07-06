require "json"
require_relative "../src/gen/client"
require_relative "../src/gen/operations"

api_key = ENV["PHASEO_API_KEY"]
raise "PHASEO_API_KEY is required" if api_key.nil? || api_key.empty?

base_url = ENV["PHASEO_BASE_URL"] || "https://api.phaseo.ai/v1"
model = ENV["PHASEO_SMOKE_MODEL"] || "openai/gpt-5.4-nano"
input = ENV["PHASEO_SMOKE_INPUT"] || "Hi"
max_output_tokens = (ENV["PHASEO_SMOKE_MAX_OUTPUT_TOKENS"] || "32").to_i
max_output_tokens = 32 if max_output_tokens <= 0

client = Phaseo::Gen::Client.new(base_url: base_url, headers: { "Authorization" => "Bearer #{api_key}" })

response = Phaseo::Gen::Operations.createResponse(
  client,
  body: {
    model: model,
    input: input,
    max_output_tokens: max_output_tokens
  }
)

puts JSON.pretty_generate(response)
