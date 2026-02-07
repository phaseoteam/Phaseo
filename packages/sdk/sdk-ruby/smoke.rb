require "json"
require "net/http"
require_relative "lib/index"

manifest_path = File.expand_path("../../smoke-manifest.json", __dir__)
manifest = JSON.parse(File.read(manifest_path))

api_key_env = manifest["apiKeyEnv"] || "AI_STATS_API_KEY"
base_url_env = manifest["baseUrlEnv"] || "AI_STATS_BASE_URL"
api_key = ENV[api_key_env]
abort("Set #{api_key_env}") unless api_key

base_url = (ENV[base_url_env] || manifest["defaultBaseUrl"]).sub(%r{/+$}, "")

client = AIStatsSdk::Client.new(api_key: api_key, base_path: base_url)

health = client.health
raise "health status missing" unless health.respond_to?(:status) && health.status

models = client.list_models
raise "models list empty" unless models.respond_to?(:models) && models.models&.any?

chat_payload = manifest.dig("operations", "chat", "body")
chat = client.generate_text(chat_payload)
raise "chat choices empty" unless chat.respond_to?(:choices) && chat.choices&.any?

unauth = manifest.dig("operations", "unauthorized")
unauth_uri = URI("#{base_url}#{unauth["path"]}")
unauth_res = Net::HTTP.start(unauth_uri.host, unauth_uri.port, use_ssl: unauth_uri.scheme == "https") do |http|
  http.request(Net::HTTP::Get.new(unauth_uri))
end
allowed = [unauth["expectStatus"], 403]
raise "unauthorized status #{unauth_res.code}" unless allowed.include?(unauth_res.code.to_i)

not_found = manifest.dig("operations", "notFound")
nf_uri = URI("#{base_url}#{not_found["path"]}")
nf_req = Net::HTTP::Get.new(nf_uri)
nf_req["Authorization"] = "Bearer #{api_key}"
nf_res = Net::HTTP.start(nf_uri.host, nf_uri.port, use_ssl: nf_uri.scheme == "https") do |http|
  http.request(nf_req)
end
raise "not-found status #{nf_res.code}" unless nf_res.code.to_i == not_found["expectStatus"]

puts "ruby smoke ok"
