require "json"
require_relative "../lib/index"

api_key = ENV["AI_STATS_API_KEY"]
raise "AI_STATS_API_KEY is required" if api_key.nil? || api_key.empty?

base_url = ENV["AI_STATS_BASE_URL"] || "https://api.phaseo.app/v1"
model = ENV["AI_STATS_SMOKE_MODEL"] || "openai/gpt-5-nano"
input = ENV["AI_STATS_SMOKE_INPUT"] || "Hi"
max_output_tokens = (ENV["AI_STATS_SMOKE_MAX_OUTPUT_TOKENS"] || "32").to_i
max_output_tokens = 32 if max_output_tokens <= 0

client = AIStatsSdk::AIStats.new(
  api_key: api_key,
  base_path: base_url,
  enable_deprecation_warnings: false,
  devtools: AIStatsSdk::Devtools.create
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
