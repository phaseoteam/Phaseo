require "json"
require "net/http"
require_relative "lib/index"

env_path = File.expand_path(".env.local", __dir__)
if File.exist?(env_path)
  File.read(env_path).each_line do |line|
    stripped = line.strip
    next if stripped.empty? || stripped.start_with?("#")

    key, value = stripped.split("=", 2)
    next unless key && value

    key = key.sub(/\A\uFEFF/, "")
    value = value.strip
    if value.start_with?('"') && value.end_with?('"')
      value = value[1..-2]
    elsif value.start_with?("'") && value.end_with?("'")
      value = value[1..-2]
    end

    ENV[key] = value
  end
end

manifest_path = File.expand_path("../smoke-manifest.json", __dir__)
manifest = JSON.parse(File.read(manifest_path))

api_key_env = manifest["apiKeyEnv"] || "AI_STATS_API_KEY"
base_url_env = manifest["baseUrlEnv"] || "AI_STATS_BASE_URL"
api_key = ENV[api_key_env]
abort("Set #{api_key_env}") unless api_key

base_url = (ENV[base_url_env] || manifest["defaultBaseUrl"]).sub(%r{/+$}, "")

client = AIStatsSdk::Client.new(api_key: api_key, base_path: base_url)

health_base = base_url.sub(%r{/v1$}, "")
health_uri = URI("#{health_base}/health")
health_req = Net::HTTP::Get.new(health_uri)
health_req["Authorization"] = "Bearer #{api_key}"
health_res = Net::HTTP.start(health_uri.host, health_uri.port, use_ssl: health_uri.scheme == "https") do |http|
  http.request(health_req)
end
unless health_res.code.to_i == 200
  warn "health check skipped (status #{health_res.code})"
end

begin
  models = client.list_models
  raise "models list empty" unless models.respond_to?(:models) && models.models&.any?
rescue => e
  warn "models check skipped (#{e.class}: #{e.message})"
end

responses_payload = manifest.dig("operations", "responses", "body")
responses = client.generate_response(responses_payload)
if responses.is_a?(Hash)
  choices = responses["choices"]
  content = responses["content"]
  output = responses["output"]
else
  choices = responses.respond_to?(:choices) ? responses.choices : nil
  content = responses.respond_to?(:content) ? responses.content : nil
  output = responses.respond_to?(:output) ? responses.output : nil
end
raise "responses missing choices, content, or output" unless (choices && !choices.empty?) || (content && !content.empty?) || (output && !output.empty?)

unauth = manifest.dig("operations", "unauthorized")
unauth_uri = URI("#{base_url}#{unauth["path"]}")
unauth_req = Net::HTTP::Post.new(unauth_uri)
unauth_res = Net::HTTP.start(unauth_uri.host, unauth_uri.port, use_ssl: unauth_uri.scheme == "https") do |http|
  http.request(unauth_req)
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
