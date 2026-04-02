require_relative '../lib/index'

api_key = ENV['AI_STATS_API_KEY']
raise 'Set AI_STATS_API_KEY' unless api_key

client = AIStatsSdk::AIStats.new(api_key: api_key)
resp = client.list_models(limit: 5)
models = resp.is_a?(Hash) ? (resp["models"] || []) : []
puts "models: #{models.length}"
