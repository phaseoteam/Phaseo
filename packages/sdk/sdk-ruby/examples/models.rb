require_relative '../lib/index'

api_key = ENV['PHASEO_API_KEY']
raise 'Set PHASEO_API_KEY' unless api_key

client = PhaseoSdk::Phaseo.new(api_key: api_key)
resp = client.list_models(
  provider: "anthropic",
  provider_status: "beta,not_ready",
  provider_availability_reason: "preview_only,provider_not_ready",
  capability_status: "coming_soon,internal_testing",
  availability: "all",
  limit: 5,
)
models = resp.is_a?(Hash) ? (resp["models"] || []) : []
puts "models: #{models.length}"
