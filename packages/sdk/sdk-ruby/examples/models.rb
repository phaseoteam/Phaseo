require_relative '../lib/index'

api_key = ENV['AI_STATS_API_KEY']
raise 'Set AI_STATS_API_KEY' unless api_key

client = AIStatsSdk::Client.new(api_key: api_key)
resp = client.get_models(limit: 5)
puts "models: #{resp.models&.length}"
