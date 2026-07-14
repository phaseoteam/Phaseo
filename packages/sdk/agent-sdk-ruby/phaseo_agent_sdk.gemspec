Gem::Specification.new do |spec|
  spec.name          = "phaseo_agent_sdk"
  spec.version       = "0.1.0"
  spec.summary       = "Ruby agent SDK for Phaseo Gateway"
  spec.authors       = ["Phaseo"]
  spec.add_runtime_dependency "phaseo_sdk"
  spec.files         = Dir["lib/**/*.rb", "README.md"]
  spec.require_paths = ["lib"]
end
