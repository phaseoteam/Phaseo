require "json"
require_relative "../src/gen/client"
require_relative "../src/gen/operations"

api_key = ENV["AI_STATS_API_KEY"]
raise "AI_STATS_API_KEY is required" if api_key.nil? || api_key.empty?

base_url = ENV["AI_STATS_BASE_URL"] || "https://api.phaseo.app/v1"

client = AiStats::Gen::Client.new(base_url: base_url, headers: { "Authorization" => "Bearer #{api_key}" })

response = AiStats::Gen::Operations.createResponse(
  client,
  body: {
    model: "openai/gpt-5-nano",
    input: "Hi"
  }
)

puts JSON.pretty_generate(response)
