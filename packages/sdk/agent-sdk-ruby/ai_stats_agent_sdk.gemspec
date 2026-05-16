Gem::Specification.new do |spec|
  spec.name          = "ai_stats_agent_sdk"
  spec.version       = "0.1.0"
  spec.summary       = "Ruby agent SDK for AI Stats Gateway"
  spec.authors       = ["AI Stats"]
  spec.add_runtime_dependency "ai_stats_sdk"
  spec.files         = Dir["lib/**/*.rb", "README.md"]
  spec.require_paths = ["lib"]
end
